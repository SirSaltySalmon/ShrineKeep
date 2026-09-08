// Real independent PostgreSQL sessions. Called only by the isolated native runner.
import { spawn } from "node:child_process"
import assert from "node:assert/strict"

const [psql, port] = process.argv.slice(2)
if (!psql || !/^\d+$/.test(port ?? "")) throw new Error("Expected psql path and isolated local port")
const sessions = []
let nextMarker = 0

class Session {
  constructor(name) {
    this.name = name
    this.output = ""
    this.errors = ""
    this.pending = null
    this.process = spawn(psql, ["-X", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
      windowsHide: true, env: { ...process.env, PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"],
    })
    sessions.push(this)
    this.process.stdout.on("data", chunk => { this.output += chunk.toString(); this.flush() })
    this.process.stderr.on("data", chunk => { this.errors += chunk.toString() })
    this.process.on("error", error => this.fail(error))
    this.process.on("exit", code => this.fail(new Error(`${name} exited ${code}: ${this.errors}`)))
  }
  fail(error) {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null }
  }
  flush() {
    if (!this.pending) return
    const lines = this.output.split(/\r?\n/)
    const index = lines.indexOf(this.pending.marker)
    if (index < 0) return
    const pending = this.pending
    this.pending = null
    this.output = lines.slice(index + 1).join("\n")
    clearTimeout(pending.timer)
    pending.resolve(lines.slice(0, index).filter(Boolean))
  }
  query(sql) {
    assert.equal(this.pending, null, "Session query must be serialized")
    const marker = `result_${++nextMarker}`
    return new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject, timer: setTimeout(() => this.fail(new Error(`${this.name} timed out: ${this.errors}`)), 15_000) }
      this.process.stdin.write(`${sql}; SELECT '${marker}';\n`)
    })
  }
  close() { this.process.stdin.end("ROLLBACK;\\q\n") }
}

const uuid = n => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const observer = new Session("sharing-test-observer")
const leader = new Session("sharing-test-leader")
const follower = new Session("sharing-test-follower")

async function waitForAdvisoryBlock() {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const result = await observer.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='sharing-test-follower' AND wait_event='advisory'")
    if (result.at(-1) === "1") return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error("Follower never entered verified advisory-lock wait")
}

async function contend(firstSql, secondSql) {
  await leader.query(`BEGIN; SET LOCAL ROLE service_role; ${firstSql}`)
  const second = follower.query(`BEGIN; SET LOCAL ROLE service_role; ${secondSql}; COMMIT`)
  // Attach immediately so failure while inspecting the lock does not go unhandled.
  second.catch(() => {})
  await waitForAdvisoryBlock()
  await leader.query("COMMIT")
  return JSON.parse((await second).at(-1))
}

try {
  await observer.query(`INSERT INTO auth.users (id,email,raw_user_meta_data) SELECT
    ('91000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    'concurrency-' || n || '@test.invalid',jsonb_build_object('username','concurrency-' || n)
    FROM generate_series(1,10) n`)
  const duplicate = await contend(
    `SELECT public.social_mutate('${uuid(1)}','${uuid(2)}','send_request')`,
    `SELECT public.social_mutate('${uuid(1)}','${uuid(2)}','send_request')`)
  assert.equal(duplicate.ok, true)
  assert.equal((await observer.query(`SELECT count(*) FROM public.social_notifications WHERE recipient_id='${uuid(2)}'`)).at(-1), "1")
  console.log("PASS concurrent duplicate request: one notification")

  const opposite = await contend(
    `SELECT public.social_mutate('${uuid(3)}','${uuid(4)}','send_request')`,
    `SELECT public.social_mutate('${uuid(4)}','${uuid(3)}','send_request')`)
  assert.equal(opposite.ok, true)
  assert.equal((await observer.query(`SELECT status FROM public.social_friendships WHERE user_low='${uuid(3)}' AND user_high='${uuid(4)}'`)).at(-1), "pending")
  console.log("PASS concurrent opposite requests: no implicit acceptance")

  await observer.query(`SET ROLE service_role; SELECT public.social_mutate('${uuid(5)}','${uuid(6)}','send_request'); RESET ROLE`)
  const requestId = (await observer.query(`SELECT request_id FROM public.social_friendships WHERE user_low='${uuid(5)}' AND user_high='${uuid(6)}'`)).at(-1)
  assert.match(requestId, /^[0-9a-f-]{36}$/)
  const blockedAccept = await contend(
    `SELECT public.social_mutate('${uuid(5)}','${uuid(6)}','block')`,
    `SELECT public.social_mutate('${uuid(6)}','${uuid(5)}','accept','${requestId}',1)`)
  assert.equal(blockedAccept.error.code, "not_found")
  assert.equal((await observer.query(`SELECT count(*) FROM public.social_friendships WHERE user_low='${uuid(5)}' AND user_high='${uuid(6)}'`)).at(-1), "0")
  console.log("PASS block/accept contention: committed block denies acceptance")

  const box = "92000000-0000-4000-8000-000000000001"
  await observer.query(`INSERT INTO public.boxes(id,user_id,name) VALUES ('${box}','${uuid(7)}','Concurrent box')`)
  await observer.query(`UPDATE public.user_settings SET root_collection_visibility='public', root_wishlist_visibility='public' WHERE user_id='${uuid(7)}'`)
  const revision = (await observer.query(`SELECT sharing_revision FROM public.users WHERE id='${uuid(7)}'`)).at(-1)
  assert.match(revision, /^\d+$/)
  const staleSave = await contend(
    `SELECT public.sharing_update_box('${uuid(7)}','${box}','public',false,'private',true,${revision},0)`,
    `SELECT public.sharing_update_box('${uuid(7)}','${box}','friends',true,'public',true,${revision},0)`)
  assert.equal(staleSave.error.code, "revision_conflict")
  assert.equal((await observer.query(`SELECT collection_visibility || ':' || share_financials || ':' || wishlist_visibility FROM public.boxes WHERE id='${box}'`)).at(-1), "public:false:private")
  assert.equal((await observer.query(`SELECT sharing_revision FROM public.users WHERE id='${uuid(7)}'`)).at(-1), String(BigInt(revision) + 1n))
  console.log("PASS concurrent sharing saves: stale writer leaves committed settings intact")

  const child = "92000000-0000-4000-8000-000000000002"
  const nextRevision = String(BigInt(revision) + 1n)
  const inherited = await contend(
    `SELECT public.sharing_update_box('${uuid(7)}','${box}','friends',true,'public',true,${nextRevision},0)`,
    `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${uuid(7)}';
     INSERT INTO public.boxes(id,user_id,parent_box_id,name) VALUES ('${child}','${uuid(7)}','${box}','Concurrent child');
     SELECT jsonb_build_object('collection',collection_visibility,'financials',share_financials,'wishlist',wishlist_visibility) FROM public.boxes WHERE id='${child}'`)
  assert.deepEqual(inherited, { collection: "friends", financials: true, wishlist: "public" })
  console.log("PASS child-create/sharing contention: child inherits committed settings")

  const photoItem = "93000000-0000-4000-8000-000000000001"
  await observer.query(`INSERT INTO public.items(id,user_id,name) VALUES ('${photoItem}','${uuid(7)}','Photo item')`)
  const photoRevision = (await observer.query(`SELECT sharing_revision FROM public.users WHERE id='${uuid(7)}'`)).at(-1)
  const photoConflict = await contend(
    `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${uuid(7)}';
     INSERT INTO public.photos(item_id,url) VALUES ('${photoItem}','https://example.test/photo')`,
    `SELECT public.sharing_update_box('${uuid(7)}','${box}','public',false,'public',true,${photoRevision},1)`)
  assert.equal(photoConflict.error.code, "revision_conflict")
  assert.equal((await observer.query(`SELECT sharing_revision FROM public.users WHERE id='${uuid(7)}'`)).at(-1), String(BigInt(photoRevision) + 1n))
  console.log("PASS photo-write/sharing contention: committed photo invalidates stale save")

  const sendKey = "94000000-0000-4000-8000-000000000001"
  const duplicateReceipt = await contend(
    `SELECT public.social_send_request('${uuid(8)}','${uuid(9)}','${sendKey}')`,
    `SELECT public.social_send_request('${uuid(8)}','${uuid(9)}','${sendKey}')`)
  assert.equal(duplicateReceipt.ok, true)
  assert.equal((await observer.query(`SELECT count(*) FROM sharing_private.social_request_receipts WHERE actor_id='${uuid(8)}'`)).at(-1), "1")
  assert.equal((await observer.query(`SELECT count(*) FROM public.social_notifications WHERE recipient_id='${uuid(9)}'`)).at(-1), "1")
  console.log("PASS concurrent send retries: one receipt and one notification")

  const conflictingReceipt = await contend(
    `SELECT public.social_send_request('${uuid(8)}','${uuid(9)}','${sendKey}')`,
    `SELECT public.social_send_request('${uuid(8)}','${uuid(10)}','${sendKey}')`)
  assert.equal(conflictingReceipt.error.code, "idempotency_conflict")
  assert.equal((await observer.query(`SELECT count(*) FROM public.social_notifications WHERE recipient_id='${uuid(10)}'`)).at(-1), "0")
  console.log("PASS concurrent key reuse: mismatched target cannot create request")

  const mediaOwner = uuid(7)
  const mediaAssetPath = `${mediaOwner}/items/gc-lease.jpg`
  const mediaAsset = (await observer.query(`SET ROLE service_role; SELECT public.media_register_asset('${mediaOwner}','item-photos','${mediaAssetPath}','image/jpeg',12,'ready') -> 'data' ->> 'assetId'; RESET ROLE`)).at(-1)
  assert.match(mediaAsset, /^[0-9a-f-]{36}$/)
  await observer.query(`SET ROLE service_role; INSERT INTO public.copy_jobs (id,requester_id,source_owner_id,source_root_box_id,idempotency_key,payload_hash,state)
    VALUES ('96000000-0000-4000-8000-000000000001','${uuid(8)}','${mediaOwner}','${box}','media-lease','hash-media','copying'); RESET ROLE`)
  const leaseBlocksGc = await contend(
    `SELECT public.media_lease_asset('96000000-0000-4000-8000-000000000001','${mediaAsset}',60)`,
    `SELECT sharing_private.lock_accounts('${mediaOwner}');
     INSERT INTO public.media_gc_queue(asset_id) VALUES ('${mediaAsset}') ON CONFLICT DO NOTHING;
     SELECT public.media_claim_gc(10)`)
  assert.equal(leaseBlocksGc.data.assets.length, 0)
  assert.equal((await observer.query(`SELECT state FROM public.media_assets WHERE id='${mediaAsset}'`)).at(-1), "ready")
  console.log("PASS lease/GC contention: live lease prevents deleting claim")

  const gcAsset = (await observer.query(`SET ROLE service_role; SELECT public.media_register_asset('${mediaOwner}','item-photos','${mediaOwner}/items/two-workers.jpg','image/jpeg',12,'ready') -> 'data' ->> 'assetId'; RESET ROLE`)).at(-1)
  await observer.query(`INSERT INTO public.media_gc_queue(asset_id) VALUES ('${gcAsset}')`)
  const secondGcWorker = await contend(`SELECT public.media_claim_gc(4)`, `SELECT public.media_claim_gc(4)`)
  assert.equal(secondGcWorker.data.assets.length, 0)
  assert.equal((await observer.query(`SELECT attempt_count FROM public.media_gc_queue WHERE asset_id='${gcAsset}'`)).at(-1), "1")
  console.log("PASS GC worker contention: one live claim and one attempt")

  const deleteTarget = "92000000-0000-4000-8000-000000000010"
  await observer.query(`INSERT INTO public.boxes(id,user_id,name) VALUES ('${deleteTarget}','${uuid(7)}','Delete contention')`)
  const deleteWait = await contend(
    `SELECT public.sharing_preview_box('${uuid(7)}','${box}')`,
    `SELECT public.sharing_delete_boxes('${uuid(7)}', ARRAY['${deleteTarget}']::uuid[], 'move-up')`)
  assert.equal(deleteWait.ok, true)
  assert.equal((await observer.query(`SELECT count(*) FROM public.boxes WHERE id='${deleteTarget}'`)).at(-1), "0")
  console.log("PASS delete/sharing contention: move-up waits for account lock")
} finally {
  for (const session of sessions) session.close()
}
