import { AUDIENCES, type Audience, type OperationResult, type OwnerSharingUpdate, type SharingMutationService, type SharingSettings, type SharingUpdate } from "../contracts"
import { isPublicBioValid, isPublicNicknameValid } from "../identity"
import type { SharingRpc } from "./read-core"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenShape = /^[A-Za-z0-9_-]{8,128}$/
const invalid = { ok: false, error: { code: "invalid_input", status: 400 } } as const
const unavailable = { ok: false, error: { code: "temporarily_unavailable", status: 503 } } as const
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function audience(value: unknown): value is Audience { return typeof value === "string" && AUDIENCES.some(item => item === value) }
function revision(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,19}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
}
function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) return Number(value)
  return null
}
function sharingSettings(value: unknown): SharingSettings | null {
  const body = record(value)
  if (!body || !audience(body.collectionVisibility) || !audience(body.wishlistVisibility) || typeof body.shareFinancials !== "boolean") return null
  return { collectionVisibility: body.collectionVisibility, wishlistVisibility: body.wishlistVisibility, shareFinancials: body.shareFinancials }
}

/** Route supplies the box ID; client may supply only editor values, never actor. */
export function parseSharingUpdate(boxId: string, value: unknown): SharingUpdate | null {
  const body = record(value)
  if (!uuid.test(boxId) || !body || !audience(body.collectionVisibility) || !audience(body.wishlistVisibility) ||
    typeof body.shareFinancials !== "boolean" || typeof body.applyToDescendants !== "boolean" || !revision(body.expectedRevision) ||
    typeof body.expectedDescendantCount !== "number" || !Number.isSafeInteger(body.expectedDescendantCount) || body.expectedDescendantCount < 0) return null
  return { boxId, collectionVisibility: body.collectionVisibility, wishlistVisibility: body.wishlistVisibility,
    shareFinancials: body.shareFinancials, applyToDescendants: body.applyToDescendants,
    expectedRevision: body.expectedRevision, expectedDescendantCount: body.expectedDescendantCount }
}

/** Client may supply profile and root values, never actor. Empty display name becomes null. */
export function parseOwnerSharingUpdate(value: unknown): OwnerSharingUpdate | null {
  const body = record(value)
  if (!body || typeof body.profileShareStyle !== "boolean" || typeof body.wishlistLinkEnabled !== "boolean" || !revision(body.expectedRevision)) return null
  const nickname = body.nickname === null || body.nickname === "" ? null : body.nickname
  if (!isPublicNicknameValid(nickname) || !isPublicBioValid(body.bio)) return null
  const root = sharingSettings(body.root)
  if (!root) return null
  const wishlistShareToken = body.wishlistShareToken === null || body.wishlistShareToken === undefined ? null : body.wishlistShareToken
  if (wishlistShareToken !== null && (typeof wishlistShareToken !== "string" || !tokenShape.test(wishlistShareToken))) return null
  return {
    nickname: typeof nickname === "string" ? nickname.trim() || null : null,
    bio: body.bio,
    profileShareStyle: body.profileShareStyle,
    root,
    wishlistLinkEnabled: body.wishlistLinkEnabled,
    wishlistShareToken,
    expectedRevision: body.expectedRevision,
  }
}

export function createSharingMutationCore(rpc: SharingRpc): SharingMutationService {
  async function call(name: string, args: Record<string, unknown>): Promise<OperationResult<Record<string, unknown>>> {
    try {
      const response = await rpc(name, args)
      if (response.error) return unavailable
      const envelope = record(response.data)
      if (envelope?.ok === true) {
        const data = record(envelope.data)
        return data ? { ok: true, data } : unavailable
      }
      const error = record(envelope?.error)
      switch (error?.code) {
        case "invalid_input": return invalid
        case "authentication_required": return { ok: false, error: { code: "authentication_required", status: 401 } }
        case "mutation_forbidden": return { ok: false, error: { code: "mutation_forbidden", status: 403 } }
        case "not_found": return { ok: false, error: { code: "not_found", status: 404 } }
        case "revision_conflict": return { ok: false, error: { code: "revision_conflict", status: 409 } }
        case "privacy_conflict": return { ok: false, error: { code: "privacy_conflict", status: 409 } }
        default: return unavailable
      }
    } catch { return unavailable }
  }
  return {
    async preview(actorId, boxId) {
      if (!uuid.test(actorId) || !uuid.test(boxId)) return invalid
      const result = await call("sharing_preview_box", { p_actor_id: actorId, p_box_id: boxId })
      if (!result.ok) return result
      const settings = record(result.data.settings)
      if (!revision(result.data.revision) || typeof result.data.descendantCount !== "number" || !Number.isSafeInteger(result.data.descendantCount) || result.data.descendantCount < 0 ||
        !settings || !audience(settings.collectionVisibility) || !audience(settings.wishlistVisibility) || typeof settings.shareFinancials !== "boolean") return unavailable
      return { ok: true, data: { revision: result.data.revision, descendantCount: result.data.descendantCount,
        settings: { collectionVisibility: settings.collectionVisibility, wishlistVisibility: settings.wishlistVisibility, shareFinancials: settings.shareFinancials } } }
    },
    async update(actorId, input) {
      const parsed = parseSharingUpdate(input.boxId, input)
      if (!uuid.test(actorId) || !parsed) return invalid
      const result = await call("sharing_update_box", { p_actor_id: actorId, p_box_id: parsed.boxId,
        p_collection_visibility: parsed.collectionVisibility, p_wishlist_visibility: parsed.wishlistVisibility,
        p_share_financials: parsed.shareFinancials, p_apply_descendants: parsed.applyToDescendants,
        p_expected_revision: parsed.expectedRevision, p_expected_descendant_count: parsed.expectedDescendantCount })
      if (!result.ok) return result
      return revision(result.data.revision) ? { ok: true, data: { revision: result.data.revision } } : unavailable
    },
    async readOwnerSettings(actorId) {
      if (!uuid.test(actorId)) return invalid
      const result = await call("sharing_read_owner_settings", { p_actor_id: actorId })
      if (!result.ok) return result
      const root = sharingSettings(result.data.root)
      const token = result.data.wishlistShareToken
      const visibleCount = asCount(result.data.wishlistGuestVisibleCount)
      const totalCount = asCount(result.data.wishlistGuestTotalCount)
      if (!root || !revision(result.data.revision) || !isPublicNicknameValid(result.data.nickname) || !isPublicBioValid(result.data.bio)
        || typeof result.data.profileShareStyle !== "boolean" || typeof result.data.wishlistLinkEnabled !== "boolean"
        || !(token === null || (typeof token === "string" && tokenShape.test(token)))
        || visibleCount === null || totalCount === null) return unavailable
      return {
        ok: true,
        data: {
          nickname: result.data.nickname === null ? null : String(result.data.nickname).trim() || null,
          bio: result.data.bio,
          profileShareStyle: result.data.profileShareStyle,
          root,
          wishlistLinkEnabled: result.data.wishlistLinkEnabled,
          wishlistShareToken: token,
          revision: result.data.revision,
          wishlistGuestVisibleCount: visibleCount,
          wishlistGuestTotalCount: totalCount,
        },
      }
    },
    async updateOwnerSettings(actorId, input) {
      const parsed = parseOwnerSharingUpdate(input)
      if (!uuid.test(actorId) || !parsed) return invalid
      const result = await call("sharing_update_owner_settings", {
        p_actor_id: actorId,
        p_nickname: parsed.nickname,
        p_bio: parsed.bio,
        p_profile_share_style: parsed.profileShareStyle,
        p_root_collection_visibility: parsed.root.collectionVisibility,
        p_root_share_financials: parsed.root.shareFinancials,
        p_root_wishlist_visibility: parsed.root.wishlistVisibility,
        p_wishlist_link_enabled: parsed.wishlistLinkEnabled,
        p_wishlist_share_token: parsed.wishlistShareToken,
        p_expected_revision: parsed.expectedRevision,
      })
      if (!result.ok) return result
      const token = result.data.wishlistShareToken
      const visibleCount = asCount(result.data.wishlistGuestVisibleCount)
      const totalCount = asCount(result.data.wishlistGuestTotalCount)
      if (!revision(result.data.revision) || !(token === null || (typeof token === "string" && tokenShape.test(token)))
        || visibleCount === null || totalCount === null) return unavailable
      return { ok: true, data: { revision: result.data.revision, wishlistShareToken: token, wishlistGuestVisibleCount: visibleCount, wishlistGuestTotalCount: totalCount } }
    },
  }
}
