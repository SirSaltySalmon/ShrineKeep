import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { applyItemPatch } from "@/lib/api/patch-item"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MAX_BATCH_SIZE = 100
const MAX_PRICE = 99_999_999.99

interface SuggestedItemChange {
  id: string
  expected_updated_at: string
  name?: string
  description?: string | null
  tag_ids?: string[]
  current_value?: number
  acquisition_price?: number
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

    const body = (await request.json()) as { changes?: SuggestedItemChange[] }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return NextResponse.json({ error: "changes must be a non-empty array" }, { status: 400 })
    }
    if (body.changes.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `At most ${MAX_BATCH_SIZE} item edits can be applied at once` },
        { status: 400 }
      )
    }

    const ids = new Set<string>()
    for (const change of body.changes) {
      if (!change || typeof change.id !== "string" || !change.id) {
        return NextResponse.json({ error: "Every change requires an item id" }, { status: 400 })
      }
      if (ids.has(change.id)) {
        return NextResponse.json({ error: "Each item may appear only once" }, { status: 400 })
      }
      ids.add(change.id)
      if (typeof change.expected_updated_at !== "string" || !change.expected_updated_at) {
        return NextResponse.json(
          { error: "Every change requires expected_updated_at" },
          { status: 400 }
        )
      }
      if (
        change.name === undefined &&
        change.description === undefined &&
        change.tag_ids === undefined &&
        change.current_value === undefined &&
        change.acquisition_price === undefined
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
      if (change.current_value !== undefined && !validPrice(change.current_value)) {
        return NextResponse.json({ error: "Invalid current_value" }, { status: 400 })
      }
      if (change.acquisition_price !== undefined && !validPrice(change.acquisition_price)) {
        return NextResponse.json({ error: "Invalid acquisition_price" }, { status: 400 })
      }
    }

    const { data: currentRows, error: currentError } = await supabase
      .from("items")
      .select("id, updated_at")
      .eq("user_id", user.id)
      .eq("is_wishlist", false)
      .in("id", Array.from(ids))
    if (currentError) throw currentError
    if ((currentRows ?? []).length !== ids.size) {
      return NextResponse.json({ error: "One or more items were not found" }, { status: 404 })
    }

    const updatedAtById = new Map((currentRows ?? []).map((row) => [row.id, row.updated_at]))
    const conflicts = body.changes
      .filter((change) => updatedAtById.get(change.id) !== change.expected_updated_at)
      .map((change) => change.id)
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Some items changed after the suggestions were created", conflicts },
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
            ...(change.current_value !== undefined
              ? { current_value: change.current_value }
              : {}),
            ...(change.acquisition_price !== undefined
              ? { acquisition_price: change.acquisition_price }
              : {}),
          },
        })
        applied.push(change.id)
      } catch (error: unknown) {
        failed.push({
          id: change.id,
          error: error instanceof Error ? error.message : "Failed to apply edit",
        })
      }
    }

    return NextResponse.json({ success: failed.length === 0, applied, failed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to apply suggested edits"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
