import { NextRequest, NextResponse } from "next/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import {
  completeOwnedUpload,
  discardOwnedUpload,
  prepareOwnedUpload,
  type UploadKind,
} from "@/lib/media/server/upload-core"

const headers = { "Cache-Control": "private, no-store, max-age=0" }

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers })
}

function isKind(value: unknown): value is UploadKind {
  return value === "photo" || value === "avatar"
}

function uploadStorage(service: ReturnType<typeof createSupabaseServiceClient>) {
  return {
    async createSignedUploadUrl(bucket: string, objectPath: string) {
      const signed = await service.storage.from(bucket).createSignedUploadUrl(objectPath)
      if (signed.error || !signed.data?.signedUrl || !signed.data.token) return null
      return { signedUrl: signed.data.signedUrl, token: signed.data.token, path: signed.data.path }
    },
    async objectExists(bucket: string, objectPath: string) {
      const downloaded = await service.storage.from(bucket).download(objectPath)
      return !downloaded.error
    },
  }
}

export async function POST(request: NextRequest) {
  const session = await requireMutableUser()
  if (!session.ok) return session.response
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: { code: "invalid_input" } }, 400)
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: { code: "invalid_input" } }, 400)
  }
  const payload = body as Record<string, unknown>
  const phase = payload.phase
  const kind = payload.kind
  if (!isKind(kind)) return json({ error: { code: "invalid_input" } }, 400)

  const service = createSupabaseServiceClient()
  const rpc = (name: string, args: Record<string, unknown>) => service.rpc(name, args)
  const storage = uploadStorage(service)

  try {
    if (phase === "prepare") {
      const mime = payload.mime
      const byteSize = payload.byteSize
      if (typeof mime !== "string" || typeof byteSize !== "number") {
        return json({ error: { code: "invalid_input" } }, 400)
      }
      const result = await prepareOwnedUpload(rpc, storage, session.user.id, kind, mime, byteSize)
      return result.ok ? json(result.data, 200) : json({ error: { code: result.error.code } }, result.error.status)
    }
    if (phase === "complete") {
      const assetId = payload.assetId
      if (typeof assetId !== "string") return json({ error: { code: "invalid_input" } }, 400)
      const result = await completeOwnedUpload(rpc, storage, session.user.id, kind, assetId)
      if (!result.ok) return json({ error: { code: result.error.code } }, result.error.status)
      if (kind === "avatar") {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
        const avatarUrl = supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/avatars/${result.data.objectPath}`
          : null
        if (avatarUrl) {
          await session.supabase
            .from("users")
            .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
            .eq("id", session.user.id)
        }
        return json({ ...result.data, publicUrl: avatarUrl }, 200)
      }
      return json(result.data, 200)
    }
    if (phase === "discard") {
      const assetId = payload.assetId
      if (typeof assetId !== "string") return json({ error: { code: "invalid_input" } }, 400)
      const result = await discardOwnedUpload(rpc, session.user.id, assetId)
      return result.ok ? json(result.data, 200) : json({ error: { code: result.error.code } }, result.error.status)
    }
    return json({ error: { code: "invalid_input" } }, 400)
  } catch {
    return json({ error: { code: "temporarily_unavailable" } }, 503)
  }
}
