import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { resolvePublishedViewer } from "@/lib/sharing/server/viewer"
import type { OperationResult } from "@/lib/sharing/contracts"
import type { SocialMutation, SocialMutationResult } from "../contracts"
import { createSocialMarkRead, createSocialMutationCore, parseMarkRead, parseSocialMutation } from "./mutation-core"
import { createSocialReadCore } from "./read-core"

const headers: Record<string, string> = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization" }
const invalid = { ok: false, error: { code: "invalid_input", status: 400 } } as const
const gated = { ok: false, error: { code: "not_found", status: 404 } } as const

function json(result: OperationResult<unknown>, extra: Record<string, string> = {}) {
  const responseHeaders = { ...headers, ...extra }
  if (!result.ok && result.error.code === "rate_limited") responseHeaders["Retry-After"] = String(result.error.retryAfterSeconds)
  return result.ok ? NextResponse.json(result.data, { headers: responseHeaders })
    : NextResponse.json({ error: result.error }, { status: result.error.status, headers: responseHeaders })
}

async function readJson(request: NextRequest): Promise<unknown | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > 4096) { await reader.cancel(); return null }
    chunks.push(chunk.value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { return null }
}

async function verifiedActor(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseServerClient()
  return resolvePublishedViewer(supabase.auth, request.headers.get("authorization"),
    cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)))
}

export async function handleSocialMutation(request: NextRequest, operation: SocialMutation["operation"], pathId?: Promise<string>) {
  if (process.env.SOCIAL_MUTATIONS_ENABLED !== "true") return json(gated)
  try {
    const origin = request.headers.get("origin")
    if ((origin !== null && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ ok: false, error: { code: "mutation_forbidden", status: 403 } })
    }
    const viewer = await verifiedActor(request)
    if (!viewer.ok) return json(viewer)
    if (viewer.data.kind !== "authenticated") return json({ ok: false, error: { code: "authentication_required", status: 401 } })
    let body: unknown = {}
    if (operation !== "unfriend" && operation !== "unblock") {
      body = await readJson(request)
      if (body === null) return json(invalid)
    }
    const input = parseSocialMutation(operation, body, await pathId)
    if (!input) return json(invalid)
    const service = createSupabaseServiceClient()
    const result = await createSocialMutationCore((name, args) => service.rpc(name, args))(viewer.data.userId, input)
    return json(result.ok ? { ok: true, data: { success: true, ...result.data } } : result)
  } catch { return json({ ok: false, error: { code: "temporarily_unavailable", status: 503 } }) }
}

export async function handleSocialMarkRead(request: NextRequest) {
  if (process.env.SOCIAL_MUTATIONS_ENABLED !== "true") return json(gated)
  try {
    const origin = request.headers.get("origin")
    if ((origin !== null && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ ok: false, error: { code: "mutation_forbidden", status: 403 } })
    }
    const viewer = await verifiedActor(request)
    if (!viewer.ok) return json(viewer)
    if (viewer.data.kind !== "authenticated") return json({ ok: false, error: { code: "authentication_required", status: 401 } })
    const parsed = parseMarkRead(await readJson(request))
    if (!parsed) return json(invalid)
    const service = createSupabaseServiceClient()
    const result = await createSocialMarkRead((name, args) => service.rpc(name, args))(viewer.data.userId, parsed)
    return json(result.ok ? { ok: true, data: { success: true, ...result.data } } : result)
  } catch { return json({ ok: false, error: { code: "temporarily_unavailable", status: 503 } }) }
}

export async function handleSocialRead(request: NextRequest, surface: "friends" | "requests" | "notifications" | "blocks") {
  if (process.env.SOCIAL_MUTATIONS_ENABLED !== "true") return json(gated)
  try {
    const viewer = await verifiedActor(request)
    if (!viewer.ok) return json(viewer)
    if (viewer.data.kind !== "authenticated") return json({ ok: false, error: { code: "authentication_required", status: 401 } })
    const secret = process.env.SHARING_CURSOR_SECRET
    if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Missing cursor configuration")
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined
    const query = request.nextUrl.searchParams.get("query") ?? undefined
    const direction = request.nextUrl.searchParams.get("direction")
    if (surface === "requests" && direction !== "incoming" && direction !== "outgoing") return json(invalid)
    if (surface !== "friends" && query !== undefined) return json(invalid)
    if (surface !== "requests" && direction !== null) return json(invalid)
    const service = createSupabaseServiceClient()
    const core = createSocialReadCore((name, args) => service.rpc(name, args), secret)
    const actorId = viewer.data.userId
    const result = surface === "friends" ? await core.friends(actorId, { query, cursor })
      : surface === "requests" ? await core.requests(actorId, { direction: direction as "incoming" | "outgoing", cursor })
      : surface === "notifications" ? await core.notifications(actorId, { cursor })
      : await core.blocks(actorId, { cursor })
    return json(result)
  } catch { return json({ ok: false, error: { code: "temporarily_unavailable", status: 503 } }) }
}

export type { SocialMutationResult }
