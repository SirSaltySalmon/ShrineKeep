import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Discard unsaved uploads by asset id. Paths are accepted only to look up the
 * matching owned asset; the server never deletes Storage objects here.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response

    const body = await request.json() as { asset_ids?: unknown; storage_paths?: unknown }
    const assetIds = Array.isArray(body.asset_ids)
      ? body.asset_ids.filter((value): value is string => typeof value === "string")
      : []
    const storagePaths = Array.isArray(body.storage_paths)
      ? body.storage_paths.filter((value): value is string => typeof value === "string")
      : []

    const service = createSupabaseServiceClient()
    const ids = new Set(assetIds)
    if (storagePaths.length > 0) {
      const owned = storagePaths.filter((path) => path.split("/")[0] === session.user.id)
      if (owned.length > 0) {
        const { data } = await service
          .from("media_assets")
          .select("id")
          .eq("owner_id", session.user.id)
          .in("object_path", owned)
        for (const row of data ?? []) ids.add(row.id)
      }
    }

    if (ids.size === 0) {
      return NextResponse.json({ error: "No valid uploads provided" }, { status: 400 })
    }

    for (const assetId of Array.from(ids)) {
      await service.rpc("media_discard_upload", {
        p_owner_id: session.user.id,
        p_asset_id: assetId,
      })
    }

    return NextResponse.json({ success: true, discarded: ids.size })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cleanup storage"
    console.error("Error cleaning up storage:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
