// Start a local Next server with SOCIAL_PUBLIC_READS_ENABLED=true, then:
// node --env-file=.env.local supabase/tests/public-detail-platform.mjs http://127.0.0.1:3102
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
const api = process.argv[2]
const db = process.env.NEXT_PUBLIC_SUPABASE_URL
const loopback = url => url && ["127.0.0.1", "localhost"].includes(new URL(url).hostname)
assert.ok(loopback(api) && loopback(db), "Local app and clone only")
const client = createClient(db, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const check = result => { assert.equal(result.error, null); return result.data }
const users = []
let boxId, itemId, assetId, path, avatarPath, avatarAssetId
try {
  const password = randomUUID() + "-test-A1!"
  for (let n = 0; n < 2; n++) {
    const email = `detail-${randomUUID()}@test.invalid`
    const created = check(await client.auth.admin.createUser({ email, password, email_confirm: true }))
    users.push({ id: created.user.id, email })
  }
  const owner = users[0].id
  boxId = check(await client.from("boxes").insert({ user_id: owner, name: "Detail platform fixture" }).select("id").single()).id
  check(await client.from("boxes").update({ collection_visibility: "public" }).eq("id", boxId))
  itemId = check(await client.from("items").insert({ user_id: owner, box_id: boxId, name: "Visible item", current_value: 0, acquisition_price: 123 }).select("id").single()).id
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZkAAAAASUVORK5CYII=", "base64")
  path = `${owner}/items/detail-${randomUUID()}.png`
  check(await client.storage.from("item-photos").upload(path, png, { contentType: "image/png" }))
  const registered = check(await client.rpc("media_register_asset", { p_owner_id: owner, p_bucket: "item-photos", p_object_path: path, p_mime: "image/png", p_byte_size: png.length, p_state: "ready" }))
  assert.equal(registered.ok, true)
  assetId = registered.data.assetId
  check(await client.from("photos").insert({ item_id: itemId, url: client.storage.from("item-photos").getPublicUrl(path).data.publicUrl, storage_path: path, asset_id: assetId, is_thumbnail: true }))
  const endpoint = `${api}/api/public/users/${owner}/items/${itemId}`
  let response = await fetch(endpoint)
  assert.equal(response.status, 200)
  assert.ok(response.headers.get("content-type")?.includes("application/json"))
  assert.ok(response.headers.get("cache-control")?.includes("no-store"))
  const detail = await response.json()
  assert.equal(detail.item.currentValue, null)
  assert.equal(detail.item.acquisitionPrice, null)
  assert.equal(detail.photos.entries.length, 1)
  assert.ok(Date.parse(detail.photos.entries[0].expiresAt) - Date.now() <= 60_000)
  assert.ok(!JSON.stringify(detail).includes('"storage_path"'))
  assert.equal((await fetch(detail.photos.entries[0].url)).status, 200)
  response = await fetch(`${api}/api/public/users/${owner}/boxes/${boxId}/items`)
  assert.equal(response.status, 200)
  assert.ok((await response.json()).entries[0].thumbnail.url)
  check(await client.from("boxes").update({ share_financials: true }).eq("id", boxId))
  const shared = await (await fetch(endpoint)).json()
  assert.equal(shared.item.currentValue, 0)
  assert.equal(shared.item.acquisitionPrice, 123)

  const profileUrl = `${api}/api/public/users/${owner}`
  let published = await (await fetch(profileUrl)).json()
  assert.equal(published.avatar, null)
  assert.equal(published.sharedStyle, null)
  check(await client.from("user_settings").update({
    profile_share_style: true,
    header_font_family: "Lora",
    body_font_family: "Inter",
    border_radius: "0.75rem",
    color_scheme: { background: "0 0% 100%", evil: "url(https://SECRET.invalid)" },
    wishlist_share_token: "SECRET-TOKEN",
  }).eq("user_id", owner))
  avatarPath = `${owner}/avatars/v1-${randomUUID()}.png`
  check(await client.storage.from("avatars").upload(avatarPath, png, { contentType: "image/png" }))
  const avatarRegistered = check(await client.rpc("media_register_asset", { p_owner_id: owner, p_bucket: "avatars", p_object_path: avatarPath, p_mime: "image/png", p_byte_size: png.length, p_state: "ready" }))
  assert.equal(avatarRegistered.ok, true)
  avatarAssetId = avatarRegistered.data.assetId
  assert.equal(check(await client.rpc("media_attach_avatar", { p_owner_id: owner, p_asset_id: avatarAssetId })).ok, true)
  published = await (await fetch(profileUrl)).json()
  assert.equal(published.sharedStyle.headerFontFamily, "Lora")
  assert.equal(published.sharedStyle.borderRadius, "0.75rem")
  assert.equal(published.sharedStyle.colorScheme.background, "0 0% 100%")
  assert.equal(published.sharedStyle.colorScheme.evil, undefined)
  assert.ok(!JSON.stringify(published).includes("SECRET"))
  assert.equal(published.avatar.referenceId, owner)
  assert.equal((await fetch(published.avatar.url)).status, 200)

  const viewerClient = createClient(db, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const session = check(await viewerClient.auth.signInWithPassword({ email: users[1].email, password })).session
  assert.ok((await viewerClient.rpc("sharing_read_item_detail", { p_owner_id: owner, p_viewer_id: owner, p_item_id: itemId, p_surface: "items" })).error)
  check(await client.from("user_blocks").insert({ blocker_id: owner, blocked_id: users[1].id }))
  assert.equal((await fetch(endpoint, { headers: { Authorization: `Bearer ${session.access_token}` } })).status, 404)
  assert.equal((await fetch(endpoint)).status, 200)
  assert.equal((await fetch(endpoint, { headers: { Authorization: "Bearer expired.invalid.token" } })).status, 401)
  check(await client.from("boxes").update({ collection_visibility: "private" }).eq("id", boxId))
  assert.equal((await fetch(endpoint)).status, 404)
  console.log("PASS local Next/Auth/PostgREST/Storage: safe detail/list, signed image, finance consent, profile avatar/style allowlist, client RPC denial, blocked viewer, guest access, expired auth and privacy revocation")
} finally {
  if (itemId) check(await client.from("items").delete().eq("id", itemId))
  if (boxId) check(await client.from("boxes").delete().eq("id", boxId))
  if (path) check(await client.storage.from("item-photos").remove([path]))
  if (avatarPath) check(await client.storage.from("avatars").remove([avatarPath]))
  if (assetId) check(await client.from("media_assets").delete().eq("id", assetId))
  if (avatarAssetId) {
    check(await client.from("public_profiles").update({ avatar_asset_id: null }).eq("user_id", users[0].id))
    check(await client.from("media_assets").delete().eq("id", avatarAssetId))
  }
  for (const user of users) check(await client.auth.admin.deleteUser(user.id))
}
