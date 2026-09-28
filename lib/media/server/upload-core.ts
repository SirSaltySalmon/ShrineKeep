const PHOTO_MAX_BYTES = 4_194_304
const AVATAR_MAX_BYTES = 2_097_152
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export type UploadKind = "photo" | "avatar"

export interface UploadRpc {
  (name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface UploadStorage {
  createSignedUploadUrl(bucket: string, objectPath: string): Promise<{ signedUrl: string; token: string; path: string } | null>
  objectExists(bucket: string, objectPath: string): Promise<boolean>
}

export type UploadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; status: number } }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseEnvelope(value: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; code: string; status: number } | null {
  const body = record(value)
  if (!body) return null
  if (body.ok === true) {
    const data = record(body.data)
    return data ? { ok: true, data } : null
  }
  const error = record(body.error)
  const code = typeof error?.code === "string" ? error.code : "temporarily_unavailable"
  const status = typeof error?.status === "number" ? error.status : 503
  return { ok: false, code, status }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function bucketFor(kind: UploadKind): "item-photos" | "avatars" {
  return kind === "avatar" ? "avatars" : "item-photos"
}

function maxBytes(kind: UploadKind): number {
  return kind === "avatar" ? AVATAR_MAX_BYTES : PHOTO_MAX_BYTES
}

function objectPathFor(ownerId: string, kind: UploadKind, mime: string): string | null {
  const ext = MIME_TO_EXT[mime]
  if (!ext) return null
  const id = crypto.randomUUID()
  return kind === "avatar" ? `${ownerId}/avatars/${id}.${ext}` : `${ownerId}/items/${id}.${ext}`
}

async function rpcEnvelope(rpc: UploadRpc, name: string, args: Record<string, unknown>) {
  const response = await rpc(name, args)
  if (response.error) return { ok: false as const, code: "temporarily_unavailable", status: 503 }
  const parsed = parseEnvelope(response.data)
  if (!parsed) return { ok: false as const, code: "temporarily_unavailable", status: 503 }
  return parsed
}

export async function prepareOwnedUpload(
  rpc: UploadRpc,
  storage: UploadStorage,
  ownerId: string,
  kind: UploadKind,
  mime: string,
  byteSize: number,
): Promise<UploadResult<{
  assetId: string
  bucket: string
  objectPath: string
  signedUrl: string
  token: string
}>> {
  if (!isUuid(ownerId)) return { ok: false, error: { code: "authentication_required", status: 401 } }
  if (kind !== "photo" && kind !== "avatar") return { ok: false, error: { code: "invalid_input", status: 400 } }
  if (!(mime in MIME_TO_EXT) || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > maxBytes(kind)) {
    return { ok: false, error: { code: "invalid_input", status: 400 } }
  }
  const objectPath = objectPathFor(ownerId, kind, mime)
  if (!objectPath) return { ok: false, error: { code: "invalid_input", status: 400 } }
  const registered = await rpcEnvelope(rpc, "media_register_asset", {
    p_owner_id: ownerId,
    p_bucket: bucketFor(kind),
    p_object_path: objectPath,
    p_mime: mime,
    p_byte_size: byteSize,
    p_state: "pending",
  })
  if (!registered.ok) return { ok: false, error: { code: registered.code, status: registered.status } }
  const assetId = registered.data.assetId
  if (!isUuid(assetId)) return { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
  const signed = await storage.createSignedUploadUrl(bucketFor(kind), objectPath)
  if (!signed) {
    await rpc("media_discard_upload", { p_owner_id: ownerId, p_asset_id: assetId })
    return { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
  }
  return {
    ok: true,
    data: {
      assetId,
      bucket: bucketFor(kind),
      objectPath,
      signedUrl: signed.signedUrl,
      token: signed.token,
    },
  }
}

export async function completeOwnedUpload(
  rpc: UploadRpc,
  storage: UploadStorage,
  ownerId: string,
  kind: UploadKind,
  assetId: string,
): Promise<UploadResult<{ assetId: string; objectPath: string; state: string }>> {
  if (!isUuid(ownerId)) return { ok: false, error: { code: "authentication_required", status: 401 } }
  if (!isUuid(assetId) || (kind !== "photo" && kind !== "avatar")) {
    return { ok: false, error: { code: "invalid_input", status: 400 } }
  }
  const owned = await rpcEnvelope(rpc, "media_get_owned_asset", {
    p_owner_id: ownerId,
    p_asset_id: assetId,
  })
  if (!owned.ok) return { ok: false, error: { code: owned.code, status: owned.status } }
  const bucket = owned.data.bucket
  const objectPath = owned.data.objectPath
  if ((bucket !== "item-photos" && bucket !== "avatars") || typeof objectPath !== "string") {
    return { ok: false, error: { code: "not_found", status: 404 } }
  }
  if (bucket !== bucketFor(kind)) return { ok: false, error: { code: "not_found", status: 404 } }
  const exists = await storage.objectExists(bucket, objectPath)
  if (!exists) {
    await rpc("media_discard_upload", { p_owner_id: ownerId, p_asset_id: assetId })
    return { ok: false, error: { code: "invalid_input", status: 400 } }
  }
  const finalized = await rpcEnvelope(rpc, "media_finalize_upload", { p_asset_id: assetId })
  if (!finalized.ok) return { ok: false, error: { code: finalized.code, status: finalized.status } }
  if (kind === "avatar") {
    const attached = await rpcEnvelope(rpc, "media_attach_avatar", {
      p_owner_id: ownerId,
      p_asset_id: assetId,
    })
    if (!attached.ok) return { ok: false, error: { code: attached.code, status: attached.status } }
  }
  return { ok: true, data: { assetId, objectPath, state: "ready" } }
}

export async function discardOwnedUpload(
  rpc: UploadRpc,
  ownerId: string,
  assetId: string,
): Promise<UploadResult<{ assetId: string }>> {
  if (!isUuid(ownerId)) return { ok: false, error: { code: "authentication_required", status: 401 } }
  if (!isUuid(assetId)) return { ok: false, error: { code: "invalid_input", status: 400 } }
  const discarded = await rpcEnvelope(rpc, "media_discard_upload", {
    p_owner_id: ownerId,
    p_asset_id: assetId,
  })
  if (!discarded.ok) return { ok: false, error: { code: discarded.code, status: discarded.status } }
  return { ok: true, data: { assetId } }
}
