import type { OperationResult, PublishedViewer } from "../contracts"

export interface ViewerAuth {
  getUser(token?: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>
}

/** Never reinterpret failed supplied credentials as anonymous access. */
export async function resolvePublishedViewer(auth: ViewerAuth, authorization: string | null, hasAuthCookie: boolean): Promise<OperationResult<PublishedViewer>> {
  const denied = { ok: false, error: { code: "authentication_required", status: 401 } } as const
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!match) return denied
    const result = await auth.getUser(match[1])
    return !result.error && result.data.user ? { ok: true, data: { kind: "authenticated", userId: result.data.user.id } } : denied
  }
  if (!hasAuthCookie) return { ok: true, data: { kind: "guest" } }
  const result = await auth.getUser()
  return !result.error && result.data.user ? { ok: true, data: { kind: "authenticated", userId: result.data.user.id } } : denied
}
