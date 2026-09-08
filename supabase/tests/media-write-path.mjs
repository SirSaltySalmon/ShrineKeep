// Local clone proof: server-chosen register-on-write, and authenticated item-photos writes denied.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local clone only")
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(anon && serviceKey)
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const check = (response) => { assert.equal(response.error, null, response.error?.message); return response.data }
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZkAAAAASUVORK5CYII=", "base64")

let owner
const assets = []
const paths = []
let boxId
let itemId
try {
  const email = `w2-${randomUUID()}@test.invalid`
  const password = `Aa1!${randomUUID()}`
  const created = check(await service.auth.admin.createUser({ email, password, email_confirm: true }))
  owner = created.user.id
  const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  check(await userClient.auth.signInWithPassword({ email, password }))
  const denied = await userClient.storage.from("item-photos").upload(`${owner}/items/denied-${randomUUID()}.png`, png, {
    contentType: "image/png",
  })
  assert.ok(denied.error, "authenticated item-photos insert must be denied")

  const objectPath = `${owner}/items/${randomUUID()}.png`
  paths.push(objectPath)
  const registered = check(await service.rpc("media_register_asset", {
    p_owner_id: owner,
    p_bucket: "item-photos",
    p_object_path: objectPath,
    p_mime: "image/png",
    p_byte_size: png.length,
    p_state: "pending",
  }))
  assert.equal(registered.ok, true)
  const assetId = registered.data.assetId
  assets.push(assetId)
  const signed = check(await service.storage.from("item-photos").createSignedUploadUrl(objectPath))
  const uploaded = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "x-upsert": "false" },
    body: png,
  })
  assert.equal(uploaded.ok, true, `signed PUT failed: ${uploaded.status}`)
  const finalized = check(await service.rpc("media_finalize_upload", { p_asset_id: assetId }))
  assert.equal(finalized.ok, true)
  const asset = check(await service.from("media_assets").select("state").eq("id", assetId).single())
  assert.equal(asset.state, "ready")

  const box = check(await service.from("boxes").insert({ user_id: owner, name: "w2 write path" }).select("id").single())
  boxId = box.id
  const item = check(await service.from("items").insert({
    user_id: owner, name: "w2 photo item", box_id: boxId,
  }).select("id").single())
  itemId = item.id
  check(await service.from("photos").insert({
    item_id: itemId,
    url: objectPath,
    storage_path: objectPath,
    asset_id: assetId,
    is_thumbnail: true,
  }))
  const photo = check(await service.from("photos").select("asset_id").eq("item_id", itemId).single())
  assert.equal(photo.asset_id, assetId)
  console.log("PASS write path: authenticated item-photos denied; ready asset_id exists before any read")
} finally {
  if (itemId) await service.from("items").delete().eq("id", itemId)
  if (boxId) await service.from("boxes").delete().eq("id", boxId)
  if (paths.length) await service.storage.from("item-photos").remove(paths)
  if (assets.length) await service.from("media_assets").delete().in("id", assets)
  if (owner) await service.auth.admin.deleteUser(owner)
}
