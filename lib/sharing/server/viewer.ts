import { GUEST_VIEWER, type OperationResult, type PublishedViewer } from "../contracts"

export interface ViewerAuth {
  getUser(token?: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>
}

const denied = { ok: false, error: { code: "authentication_required", status: 401 } } as const
const guest = { ok: true, data: GUEST_VIEWER } as const

function verifiedUser(result: { data: { user: { id: string } | null }; error: unknown }): OperationResult<PublishedViewer> {
  return !result.error && result.data.user
    ? { ok: true, data: { kind: "authenticated", userId: result.data.user.id } }
    : denied
}

/**
 * Explicit Bearer credentials must verify or the request is 401.
 * Cookie sessions that cannot be verified are guests on published reads.
 * Identified blocked users still deny after a successful getUser.
 */
export async function resolvePublishedViewer(auth: ViewerAuth, authorization: string | null, hasAuthCookie: boolean): Promise<OperationResult<PublishedViewer>> {
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!match) return denied
    return verifiedUser(await auth.getUser(match[1]))
  }
  if (!hasAuthCookie) return guest
  const result = await auth.getUser()
  return !result.error && result.data.user
    ? { ok: true, data: { kind: "authenticated", userId: result.data.user.id } }
    : guest
}

/** HTML published surfaces never login-wall. Unverified credentials see the guest projection. */
export function publishedViewerOrGuest(result: OperationResult<PublishedViewer>): PublishedViewer {
  return result.ok ? result.data : GUEST_VIEWER
}
