import type { OperationResult } from "@/lib/sharing/contracts"
import type { SharingRpc } from "@/lib/sharing/server/read-core"
import type { SocialInvalidation, SocialMutation, SocialMutationResult } from "../contracts"
import { SOCIAL_DEFAULTS } from "../contracts"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const invalid = { ok: false, error: { code: "invalid_input", status: 400 } } as const
const unavailable = { ok: false, error: { code: "temporarily_unavailable", status: 503 } } as const
export const SOCIAL_INVALIDATION: Record<SocialMutation["operation"], SocialInvalidation[]> = {
  send_request: ["requests", "notifications"],
  accept: ["friends", "requests", "notifications"],
  decline: ["requests", "notifications"],
  cancel: ["requests", "notifications"],
  unfriend: ["friends"],
  block: ["friends", "requests", "notifications", "blocks"],
  unblock: ["blocks"],
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function isUuid(value: unknown): value is string { return typeof value === "string" && uuid.test(value) }
function version(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
}
function revision(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,19}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
}

/** Operation and path IDs come from the route; actor always comes from auth. */
export function parseSocialMutation(operation: SocialMutation["operation"], value: unknown, pathId?: string): SocialMutation | null {
  const body = record(value)
  const targetId = operation === "unfriend" || operation === "unblock" ? pathId : body?.targetUserId
  if (!isUuid(targetId)) return null
  switch (operation) {
    case "send_request": return isUuid(body?.idempotencyKey) ? { operation, targetId, idempotencyKey: body.idempotencyKey } : null
    case "accept": case "decline": case "cancel":
      return isUuid(pathId) && version(body?.version) ? { operation, targetId, requestId: pathId, version: body.version } : null
    case "unfriend": case "block": case "unblock": return { operation, targetId }
    default: return null
  }
}

export function parseMarkRead(value: unknown): { notificationIds: string[] | null; allVisible: boolean } | null {
  const body = record(value)
  if (!body) return null
  if (body.allVisible === true) return Object.keys(body).every(key => key === "allVisible") ? { notificationIds: null, allVisible: true } : null
  if (!Array.isArray(body.notificationIds) || body.notificationIds.length < 1 || body.notificationIds.length > SOCIAL_DEFAULTS.markReadMaxIds) return null
  if (!body.notificationIds.every(isUuid) || (body.allVisible !== undefined && body.allVisible !== false)) return null
  if (Object.keys(body).some(key => key !== "notificationIds" && key !== "allVisible")) return null
  return { notificationIds: body.notificationIds, allVisible: false }
}

function mutationError(value: unknown): OperationResult<never> {
  const error = record(record(value)?.error)
  switch (error?.code) {
    case "invalid_input": return invalid
    case "authentication_required": return { ok: false, error: { code: "authentication_required", status: 401 } }
    case "mutation_forbidden": return { ok: false, error: { code: "mutation_forbidden", status: 403 } }
    case "not_found": return { ok: false, error: { code: "not_found", status: 404 } }
    case "stale_request": case "idempotency_conflict": return { ok: false, error: { code: error.code, status: 409 } }
    case "rate_limited":
      return typeof error.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
        ? { ok: false, error: { code: "rate_limited", status: 429, retryAfterSeconds: error.retryAfterSeconds } } : unavailable
    default: return unavailable
  }
}

function success(operation: SocialMutation["operation"] | "mark_read", data: unknown): OperationResult<SocialMutationResult> {
  const payload = record(data)
  if (!payload || !revision(payload.revision)) return unavailable
  return { ok: true, data: { revision: payload.revision, invalidated: operation === "mark_read" ? ["notifications"] : SOCIAL_INVALIDATION[operation] } }
}

export function createSocialMutationCore(rpc: SharingRpc) {
  return async (actorId: string, input: SocialMutation): Promise<OperationResult<SocialMutationResult>> => {
    const parsed = parseSocialMutation(input.operation, {
      targetUserId: input.targetId,
      ...("idempotencyKey" in input ? { idempotencyKey: input.idempotencyKey } : {}),
      ...("version" in input ? { version: input.version } : {}),
    }, "requestId" in input ? input.requestId : input.targetId)
    if (!isUuid(actorId) || !parsed || actorId.toLowerCase() === parsed.targetId.toLowerCase()) return invalid
    try {
      const args = parsed.operation === "send_request"
        ? { actor_id: actorId, target_id: parsed.targetId, idempotency_key: parsed.idempotencyKey }
        : { actor_id: actorId, target_id: parsed.targetId, operation: parsed.operation,
          expected_request_id: "requestId" in parsed ? parsed.requestId : null,
          expected_version: "version" in parsed ? parsed.version : null }
      const response = await rpc(parsed.operation === "send_request" ? "social_send_request" : "social_mutate", args)
      if (response.error) return unavailable
      const envelope = record(response.data)
      return envelope?.ok === true ? success(parsed.operation, envelope.data) : envelope?.ok === false ? mutationError(response.data) : unavailable
    } catch { return unavailable }
  }
}

export function createSocialMarkRead(rpc: SharingRpc) {
  return async (actorId: string, input: { notificationIds: string[] | null; allVisible: boolean }): Promise<OperationResult<SocialMutationResult>> => {
    if (!isUuid(actorId) || (input.allVisible ? input.notificationIds !== null : !input.notificationIds?.every(isUuid))) return invalid
    try {
      const response = await rpc("social_mark_read", {
        p_actor_id: actorId, p_notification_ids: input.notificationIds, p_all_visible: input.allVisible,
      })
      if (response.error) return unavailable
      const envelope = record(response.data)
      return envelope?.ok === true ? success("mark_read", envelope.data) : envelope?.ok === false ? mutationError(response.data) : unavailable
    } catch { return unavailable }
  }
}
