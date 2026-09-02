import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import { descriptionContext } from "@/lib/webmcp/description-context"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MAX_PAGE_SIZE = 25
const MAX_RESOLVE_IDS = 100

interface CollectionContextRequest {
  includeFullDescription?: boolean
  boxId?: string | null
  includeDescendants?: boolean
  offset?: number
  limit?: number
  itemIds?: string[]
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

async function getSubtreeIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  boxId: string
): Promise<string[]> {
  const ids = new Set<string>([boxId])
  let level = [boxId]

  while (level.length > 0) {
    const { data, error } = await supabase
      .from("boxes")
      .select("id")
      .eq("user_id", userId)
      .in("parent_box_id", level)
    if (error) throw error
    level = (data ?? []).map((row) => row.id).filter((id) => !ids.has(id))
    level.forEach((id) => ids.add(id))
  }

  return Array.from(ids)
}

function normalizeRows(rows: Array<Record<string, unknown>>, includeFullDescription = false) {
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    ...descriptionContext(typeof row.description === "string" ? row.description : null, includeFullDescription),
    current_value: row.current_value == null ? null : Number(row.current_value),
    acquisition_price:
      row.acquisition_price == null ? null : Number(row.acquisition_price),
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
  }))
}

/**
 * Minimal, authenticated collection context for WebMCP tools.
 * Item descriptions are truncated and results are paginated to keep tool output small.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await request.json()) as CollectionContextRequest

    if (body.itemIds !== undefined) {
      if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
        return NextResponse.json({ error: "itemIds must be a non-empty array" }, { status: 400 })
      }
      const itemIds = Array.from(new Set(body.itemIds.filter((id) => typeof id === "string")))
      if (itemIds.length === 0) {
        return NextResponse.json({ error: "itemIds must contain valid string ids" }, { status: 400 })
      }
      if (itemIds.length > MAX_RESOLVE_IDS) {
        return NextResponse.json(
          { error: `At most ${MAX_RESOLVE_IDS} item ids can be resolved at once` },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from("items")
        .select("id, name, description, current_value, acquisition_price, updated_at, item_tags(tag:tags(id, name))")
        .eq("user_id", user.id)
        .eq("is_wishlist", false)
        .in("id", itemIds)
      if (error) throw error
      return NextResponse.json({ items: normalizeRows((data ?? []) as Array<Record<string, unknown>>, body.includeFullDescription === true) })
    }

    const boxId = typeof body.boxId === "string" && body.boxId ? body.boxId : null
    const includeDescendants = body.includeDescendants === true
    const offset = clampInteger(body.offset, 0, 0, 1_000_000)
    const limit = clampInteger(body.limit, MAX_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    let boxIds: string[] | null = null
    if (boxId) {
      const owned = await getOwnedBoxIdSet(supabase, user.id, [boxId])
      if (!owned.has(boxId)) {
        return NextResponse.json({ error: "Box not found" }, { status: 404 })
      }
      boxIds = includeDescendants
        ? await getSubtreeIds(supabase, user.id, boxId)
        : [boxId]
    }

    let query = supabase
      .from("items")
      .select("id, name, description, current_value, acquisition_price, updated_at, item_tags(tag:tags(id, name))", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .eq("is_wishlist", false)

    if (boxIds) {
      query = boxIds.length === 1 ? query.eq("box_id", boxIds[0]) : query.in("box_id", boxIds)
    } else if (!includeDescendants) {
      query = query.is("box_id", null)
    }

    const { data, count, error } = await query
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) throw error

    const total = count ?? 0
    const nextOffset = offset + limit < total ? offset + limit : null
    return NextResponse.json({
      items: normalizeRows((data ?? []) as Array<Record<string, unknown>>, body.includeFullDescription === true),
      total,
      nextOffset,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load collection context"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
