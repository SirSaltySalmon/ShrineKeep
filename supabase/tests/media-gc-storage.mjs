// Local Supabase platform proof. Run: node --env-file=.env.local supabase/tests/media-gc-storage.mjs
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { runMediaGc } from "../../lib/media/server/gc-worker.ts"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local clone only")
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const check = (response) => { assert.equal(response.error, null); return response.data }
let owner
const assets = []
const paths = []
try {
  const user = check(await client.auth.admin.createUser({ email: `gc-${randomUUID()}@test.invalid`, email_confirm: true }))
  owner = user.user.id
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZkAAAAASUVORK5CYII=", "base64")
  const path = `${owner}/items/gc-${randomUUID()}.png`
  paths.push(path)
  check(await client.storage.from("item-photos").upload(path, bytes, { contentType: "image/png" }))
  const registered = check(await client.rpc("media_register_asset", {
    p_owner_id: owner, p_bucket: "item-photos", p_object_path: path,
    p_mime: "image/png", p_byte_size: bytes.length, p_state: "ready",
  }))
  assert.equal(registered.ok, true)
  const assetId = registered.data.assetId
  assets.push(assetId)
  check(await client.from("media_gc_queue").insert({ asset_id: assetId }))
  const deps = {
    rpc: async (name, args, signal) => await client.rpc(name, args).abortSignal(signal),
    remove: async (bucket, objectPath) => await client.storage.from(bucket).remove([objectPath]),
  }
  // A transient Storage failure retains the object and schedules retry.
  const failed = await runMediaGc({ ...deps, remove: async () => ({ error: { message: "injected outage" } }) })
  assert.ok(failed.retry >= 1)
  const queue = check(await client.from("media_gc_queue").select("claim_token,next_attempt_at,last_error").eq("asset_id", assetId).single())
  assert.equal(queue.claim_token, null)
  assert.equal(queue.last_error, "storage_delete_failed")
  check(await client.storage.from("item-photos").download(path))
  check(await client.from("media_gc_queue").update({ next_attempt_at: new Date(0).toISOString() }).eq("asset_id", assetId))

  // Simulate crash after Storage success but before database completion.
  const claimed = check(await client.rpc("media_claim_gc", { p_limit: 4 }))
  const claim = claimed.data.assets.find(asset => asset.id === assetId)
  assert.ok(claim)
  check(await client.storage.from("item-photos").remove([path]))
  check(await client.from("media_gc_queue").update({ claim_expires_at: new Date(0).toISOString() }).eq("asset_id", assetId))
  const retried = await runMediaGc(deps)
  assert.ok(retried.deleted >= 1)
  const asset = check(await client.from("media_assets").select("state").eq("id", assetId).single())
  assert.equal(asset.state, "deleted")
  assert.equal(check(await client.from("media_gc_queue").select("asset_id").eq("asset_id", assetId)).length, 0)
  assert.ok((await client.storage.from("item-photos").download(path)).error)
  console.log("PASS local Storage: upload, failed removal/backoff, crash after deletion, missing-object retry, tombstone")
} finally {
  if (paths.length) check(await client.storage.from("item-photos").remove(paths))
  if (assets.length) check(await client.from("media_assets").delete().in("id", assets))
  if (owner) check(await client.auth.admin.deleteUser(owner))
}
