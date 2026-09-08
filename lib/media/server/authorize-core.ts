import type { PublicMedia, OperationResult, PublishedViewer } from "@/lib/sharing/contracts"
import { SHARING_LIMITS } from "@/lib/sharing/contracts"

export type MediaRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
export type MediaSigner = (bucket: string, objectPath: string, lifetimeSeconds: number) => Promise<{ url: string } | null>
export const MEDIA_KINDS = ["photo", "avatar"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unavailable: OperationResult<never> = { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
const invalid: OperationResult<never> = { ok: false, error: { code: "invalid_input", status: 400 } }
const notFound: OperationResult<never> = { ok: false, error: { code: "not_found", status: 404 } }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseMediaKind(value: string): MediaKind | null {
  return MEDIA_KINDS.some(kind => kind === value) ? value as MediaKind : null
}

function failure(value: unknown): OperationResult<never> {
  const error = record(record(value)?.error)
  if (error?.code === "invalid_input") return invalid
  if (error?.code === "not_found") return notFound
  if (error?.code === "authentication_required") return { ok: false, error: { code: "authentication_required", status: 401 } }
  return unavailable
}

/** Reconstructs PublicMedia; signed URLs come from the storage signer, never from SQL. */
export function createMediaAuthorizeCore(
  rpc: MediaRpc,
  sign: MediaSigner,
  rpcName = "media_authorize_reference",
) {
  return async function authorize(kind: MediaKind, referenceId: string, viewer: PublishedViewer): Promise<OperationResult<PublicMedia>> {
    if (!uuid.test(referenceId) || (viewer.kind === "authenticated" && !uuid.test(viewer.userId))) return invalid
    if (rpcName === "media_authorize_owner_reference" && viewer.kind !== "authenticated") {
      return { ok: false, error: { code: "authentication_required", status: 401 } }
    }
    try {
      const response = await rpc(rpcName, {
        p_kind: kind,
        p_reference_id: referenceId,
        ...(rpcName === "media_authorize_owner_reference"
          ? { p_actor_id: viewer.kind === "authenticated" ? viewer.userId : null }
          : { p_viewer_id: viewer.kind === "guest" ? null : viewer.userId }),
      })
      if (response.error) return unavailable
      const envelope = record(response.data)
      if (envelope?.ok !== true) return failure(response.data)
      const data = record(envelope.data)
      if (!data || String(data.referenceId).toLowerCase() !== referenceId.toLowerCase()) return notFound
      if (data.kind === "external") {
        if (typeof data.externalUrl !== "string" || !/^https:\/\//i.test(data.externalUrl) || /javascript:/i.test(data.externalUrl)) return notFound
        return { ok: true, data: { referenceId, url: data.externalUrl, expiresAt: null } }
      }
      if (data.kind !== "uploaded" || typeof data.bucket !== "string" || typeof data.objectPath !== "string") return notFound
      if ((data.bucket !== "item-photos" && data.bucket !== "avatars") || data.objectPath.includes("..")) return notFound
      const signed = await sign(data.bucket, data.objectPath, SHARING_LIMITS.mediaLifetimeSeconds)
      if (!signed || typeof signed.url !== "string" || signed.url.length === 0) return notFound
      return {
        ok: true,
        data: {
          referenceId,
          url: signed.url,
          expiresAt: new Date(Date.now() + SHARING_LIMITS.mediaLifetimeSeconds * 1000).toISOString(),
        },
      }
    } catch {
      return unavailable
    }
  }
}
