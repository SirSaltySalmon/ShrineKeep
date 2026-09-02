import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { applyItemPatch } from "@/lib/api/patch-item"

const MAX_BATCH_SIZE = 100
const MAX_PRICE = 99_999_999.99

interface WishlistPriceChange {
  id: string
  expected_updated_at: string
  name?: string
  description?: string | null
  tag_ids?: string[]
  expected_price?: number
  current_value?: number
}

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE
}

function validTagIds(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length <= 256 &&
    value.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(value).size === value.length
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session

    const body = (await request.json()) as { changes?: WishlistPriceChange[] }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return NextResponse.json({ error: "changes must be a non-empty array" }, { status: 400 })
    }
    if (body.changes.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `At most ${MAX_BATCH_SIZE} wishlist edits can be applied at once` },
        { status: 400 }
      )
    }

    const ids = new Set<string>()
    for (const change of body.changes) {
      if (!change || typeof change.id !== "string" || !change.id || ids.has(change.id)) {
        return NextResponse.json({ error: "Each change requires a unique item id" }, { status: 400 })
      }
      ids.add(change.id)
      if (typeof change.expected_updated_at !== "string" || !change.expected_updated_at) {
        return NextResponse.json({ error: "Every change requires expected_updated_at" }, { status: 400 })
      }
      if (
        change.name === undefined &&
        change.description === undefined &&
        change.tag_ids === undefined &&
        change.expected_price === undefined &&
        change.current_value === undefined
      ) {
        return NextResponse.json(
          { error: "Every change must propose at least one editable field" },
          { status: 400 }
        )
      }
      if (
        change.name !== undefined &&
        (typeof change.name !== "string" || !change.name.trim() || change.name.trim().length > 200)
      ) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 })
      }
      if (
        change.description !== undefined &&
        change.description !== null &&
        (typeof change.description !== "string" || change.description.length > 10_000)
      ) {
        return NextResponse.json({ error: "Invalid description" }, { status: 400 })
      }
      if (change.tag_ids !== undefined && !validTagIds(change.tag_ids)) {
        return NextResponse.json({ error: "Invalid tag_ids" }, { status: 400 })
      }
      if (change.expected_price !== undefined && !validPrice(change.expected_price)) {
        return NextResponse.json({ error: "Invalid expected_price" }, { status: 400 })
      }
      if (change.current_value !== undefined && !validPrice(change.current_value)) {
        return NextResponse.json({ error: "Invalid current_value" }, { status: 400 })
      }
    }

    const { data: rows, error } = await supabase
      .from("items")
      .select("id, updated_at")
      .eq("user_id", user.id)
      .eq("is_wishlist", true)
      .in("id", Array.from(ids))
    if (error) throw error
    if ((rows ?? []).length !== ids.size) {
      return NextResponse.json({ error: "One or more wishlist items were not found" }, { status: 404 })
    }

    const updatedAtById = new Map((rows ?? []).map((row) => [row.id, row.updated_at]))
    const conflicts = body.changes
      .filter((change) => updatedAtById.get(change.id) !== change.expected_updated_at)
      .map((change) => change.id)
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Some wishlist items changed after staging", conflicts },
        { status: 409 }
      )
    }

    const applied: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const change of body.changes) {
      try {
        await applyItemPatch({
          supabase,
          userId: user.id,
          patch: {
            id: change.id,
            ...(change.name !== undefined ? { name: change.name } : {}),
            ...(change.description !== undefined ? { description: change.description } : {}),
            ...(change.tag_ids !== undefined ? { tag_ids: change.tag_ids } : {}),
            ...(change.expected_price !== undefined ? { expected_price: change.expected_price } : {}),
            ...(change.current_value !== undefined ? { current_value: change.current_value } : {}),
          },
        })
        applied.push(change.id)
      } catch (cause: unknown) {
        failed.push({
          id: change.id,
          error: cause instanceof Error ? cause.message : "Failed to apply wishlist edit",
        })
      }
    }

    return NextResponse.json({ success: failed.length === 0, applied, failed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to apply wishlist edits"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
