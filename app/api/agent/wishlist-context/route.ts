import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import { descriptionContext } from "@/lib/webmcp/description-context"

const MAX_PAGE_SIZE = 25
const MAX_RESOLVE_IDS = 100

interface WishlistContextRequest {
  includeFullDescription?: boolean
  all?: boolean
  boxId?: string | null
  offset?: number
  limit?: number
  itemIds?: string[]
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await request.json()) as WishlistContextRequest
    const requestedIds = Array.isArray(body.itemIds)
      ? Array.from(new Set(body.itemIds.filter((id) => typeof id === "string" && id)))
      : null
    if (body.itemIds !== undefined && (!requestedIds || requestedIds.length === 0)) {
      return NextResponse.json({ error: "itemIds must contain valid ids" }, { status: 400 })
    }
    if (requestedIds && requestedIds.length > MAX_RESOLVE_IDS) {
      return NextResponse.json(
        { error: `At most ${MAX_RESOLVE_IDS} item ids can be resolved at once` },
        { status: 400 }
      )
    }

    const boxId = typeof body.boxId === "string" && body.boxId ? body.boxId : null
    if (!body.all && boxId) {
      const owned = await getOwnedBoxIdSet(supabase, user.id, [boxId])
      if (!owned.has(boxId)) return NextResponse.json({ error: "Box not found" }, { status: 404 })
    }

    const offset = clampInteger(body.offset, 0, 0, 1_000_000)
    const limit = clampInteger(body.limit, MAX_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    let query = supabase
      .from("items")
      .select("id, name, description, expected_price, current_value, updated_at, wishlist_target_box_id, item_tags(tag:tags(id, name))", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .eq("is_wishlist", true)

    if (requestedIds) {
      query = query.in("id", requestedIds)
    } else if (!body.all) {
      query = boxId
        ? query.eq("wishlist_target_box_id", boxId)
        : query.is("wishlist_target_box_id", null)
    }

    const { data, count, error } = requestedIds
      ? await query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : await query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + limit - 1)
    if (error) throw error

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const boxIds = Array.from(
      new Set(
        rows
          .map((row) => row.wishlist_target_box_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    )
    const boxNames = new Map<string, string>()
    if (boxIds.length > 0) {
      const { data: boxes, error: boxesError } = await supabase
        .from("boxes")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", boxIds)
      if (boxesError) throw boxesError
      for (const box of boxes ?? []) boxNames.set(box.id, box.name)
    }

    const items = rows.map((row) => {
      const targetBoxId =
        typeof row.wishlist_target_box_id === "string" ? row.wishlist_target_box_id : null
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        ...descriptionContext(typeof row.description === "string" ? row.description : null, body.includeFullDescription === true),
        expected_price: row.expected_price == null ? null : Number(row.expected_price),
        current_value: row.current_value == null ? null : Number(row.current_value),
        tags: Array.isArray(row.item_tags)
          ? row.item_tags.flatMap((link) => {
              if (!link || typeof link !== "object" || !("tag" in link)) return []
              const tag = (link as { tag?: unknown }).tag
              if (!tag || typeof tag !== "object") return []
              const candidate = tag as { id?: unknown; name?: unknown }
              return typeof candidate.id === "string" && typeof candidate.name === "string"
                ? [{ id: candidate.id, name: candidate.name }]
                : []
            })
          : [],
        updated_at: String(row.updated_at),
        target_box_id: targetBoxId,
        target_box_name: targetBoxId ? (boxNames.get(targetBoxId) ?? "Unknown box") : "Unassigned",
      }
    })
    const total = requestedIds ? items.length : (count ?? 0)
    return NextResponse.json({
      items,
      total,
      nextOffset: !requestedIds && offset + limit < total ? offset + limit : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load wishlist context"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
