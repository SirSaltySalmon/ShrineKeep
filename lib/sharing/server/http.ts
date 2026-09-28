import { cookies, headers as requestHeaders } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createPublicReadCore } from "./read-core"
import { createMediaAuthorizeCore } from "@/lib/media/server/authorize-core"
import { publicNickname } from "../identity"
import { publishedViewerOrGuest, resolvePublishedViewer } from "./viewer"
import type {
  CursorPage,
  OperationResult,
  PublicProfile,
  PublicReadService,
  PublicWishlistItem,
  PublishedViewer,
} from "../contracts"

type ReadCore = Pick<PublicReadService, "profile" | "boxes" | "collectionItems" | "collectionItem" | "wishlistItem" | "wishlist" | "previewWishlist" | "tokenWishlist" | "stats">
type Handler = (core: ReadCore, viewer: PublishedViewer) => Promise<OperationResult<unknown>>
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function publicReadsAreEnabled() {
  return process.env.SOCIAL_PUBLIC_READS_ENABLED === "true"
}

type WiredCore =
  | { ok: false; reason: "disabled" }
  | { ok: true; core: ReadCore; resolveTokenOwner: (token: string, viewer: PublishedViewer) => Promise<string | null> }

function ownerIdFromResolve(data: unknown): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null
  const envelope = data as Record<string, unknown>
  if (envelope.ok !== true || envelope.data === null || typeof envelope.data !== "object" || Array.isArray(envelope.data)) return null
  const ownerId = (envelope.data as Record<string, unknown>).ownerId
  return typeof ownerId === "string" && uuid.test(ownerId) ? ownerId : null
}

/** Single construction of the public read core, signer, and cursor secret. Honour the kill switch here. */
async function wirePublishedReadCore(): Promise<WiredCore> {
  if (!publicReadsAreEnabled()) return { ok: false, reason: "disabled" }
  const secret = process.env.SHARING_CURSOR_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Missing cursor configuration")
  const service = createSupabaseServiceClient()
  const rpc = (name: string, args: Record<string, unknown>) => service.rpc(name, args)
  const authorize = createMediaAuthorizeCore(rpc, async (bucket, path, lifetime) => {
    const signed = await service.storage.from(bucket).createSignedUrl(path, lifetime)
    return signed.error || !signed.data?.signedUrl ? null : { url: signed.data.signedUrl }
  })
  return {
    ok: true,
    core: createPublicReadCore(rpc, secret, authorize),
    resolveTokenOwner: async (token, viewer) => {
      const response = await rpc("sharing_resolve_wishlist_token", {
        p_token: token,
        p_viewer_id: viewer.kind === "guest" ? null : viewer.userId,
      })
      return response.error ? null : ownerIdFromResolve(response.data)
    },
  }
}

export async function createPublishedReadCore(): Promise<{ ok: false; reason: "disabled" } | { ok: true; core: ReadCore }> {
  const wired = await wirePublishedReadCore()
  if (!wired.ok) return wired
  return { ok: true, core: wired.core }
}

async function resolveViewer(authorization: string | null): Promise<OperationResult<PublishedViewer>> {
  const cookieStore = await cookies()
  const hasAuthCookie = cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
  const supabase = await createSupabaseServerClient()
  return resolvePublishedViewer(supabase.auth, authorization, hasAuthCookie)
}

export type TokenWishlistPage =
  | { ok: false }
  | { ok: true; viewer: PublishedViewer; page: CursorPage<PublicWishlistItem>; profile: PublicProfile }

export type PublicProfilePage =
  | { ok: false; reason: "not_found" | "disabled" }
  | {
    ok: true
    viewer: PublishedViewer
    profile: PublicProfile
    /** Signed-in viewer's public label for AppNav. Never the profile owner's name unless the viewer is the owner. */
    viewerName: string | null
    sandbox: boolean
    socialMutationsEnabled: boolean
  }

/** In-process public profile shell. Same flag, viewer, and core as the JSON routes. */
export async function loadPublicProfilePage(ownerId: string): Promise<PublicProfilePage> {
  try {
    if (!uuid.test(ownerId)) return { ok: false, reason: "not_found" }
    if (!publicReadsAreEnabled()) return { ok: false, reason: "disabled" }
    const viewer = publishedViewerOrGuest(await resolveViewer((await requestHeaders()).get("authorization")))
    const wired = await wirePublishedReadCore()
    if (!wired.ok) return { ok: false, reason: "disabled" }
    const profile = await wired.core.profile(ownerId, viewer)
    if (!profile.ok) return { ok: false, reason: "not_found" }
    let viewerName: string | null = null
    let sandbox = false
    if (viewer.kind === "authenticated") {
      const supabase = await createSupabaseServerClient()
      const { data: row } = await supabase
        .from("users")
        .select("name, is_sandbox")
        .eq("id", viewer.userId)
        .maybeSingle()
      viewerName = publicNickname(viewer.userId, row?.name ?? null)
      sandbox = row?.is_sandbox === true
    }
    return {
      ok: true,
      viewer,
      profile: profile.data,
      viewerName,
      sandbox,
      socialMutationsEnabled: process.env.SOCIAL_MUTATIONS_ENABLED === "true",
    }
  } catch {
    return { ok: false, reason: "not_found" }
  }
}

/** In-process token surface. Same flag, viewer, and core as the JSON routes. */
export async function loadTokenWishlistPage(token: string): Promise<TokenWishlistPage> {
  try {
    if (!publicReadsAreEnabled()) return { ok: false }
    const viewer = publishedViewerOrGuest(await resolveViewer((await requestHeaders()).get("authorization")))
    const wired = await wirePublishedReadCore()
    if (!wired.ok) return { ok: false }
    const page = await wired.core.tokenWishlist(token, viewer, {})
    if (!page.ok) return { ok: false }
    const ownerId = await wired.resolveTokenOwner(token, viewer)
    if (!ownerId) return { ok: false }
    const profile = await wired.core.profile(ownerId, viewer)
    if (!profile.ok) return { ok: false }
    return { ok: true, viewer, page: page.data, profile: profile.data }
  } catch {
    return { ok: false }
  }
}

/** Keep disabled until canonical media/legacy policy cutover passes the privacy gate. */
export async function publicReadResponse(request: NextRequest, run: Handler, requireOwner = false): Promise<NextResponse> {
  if (!publicReadsAreEnabled()) return NextResponse.json({ error: { code: "not_found" } }, { status: 404, headers: responseHeaders })
  try {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.error.status, headers: responseHeaders })
    if (requireOwner && viewer.data.kind === "guest") return NextResponse.json({ error: { code: "authentication_required" } }, { status: 401, headers: responseHeaders })
    const wired = await wirePublishedReadCore()
    if (!wired.ok) return NextResponse.json({ error: { code: "not_found" } }, { status: 404, headers: responseHeaders })
    const result = await run(wired.core, viewer.data)
    return result.ok
      ? NextResponse.json(result.data, { headers: responseHeaders })
      : NextResponse.json({ error: result.error }, { status: result.error.status, headers: responseHeaders })
  } catch {
    return NextResponse.json({ error: { code: "temporarily_unavailable" } }, { status: 503, headers: responseHeaders })
  }
}
