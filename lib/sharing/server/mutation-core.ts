import { AUDIENCES, type Audience, type OperationResult, type SharingMutationService, type SharingUpdate } from "../contracts"
import type { SharingRpc } from "./read-core"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const invalid = { ok: false, error: { code: "invalid_input", status: 400 } } as const
const unavailable = { ok: false, error: { code: "temporarily_unavailable", status: 503 } } as const
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function audience(value: unknown): value is Audience { return typeof value === "string" && AUDIENCES.some(item => item === value) }
function revision(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,19}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
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
  }
}
