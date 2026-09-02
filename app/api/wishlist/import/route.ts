import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { createItems } from "@/lib/api/create-item"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MAX_IMPORT_SIZE = 500
const MAX_PRICE = 99_999_999.99

interface WishlistImportItem {
  name: string
  description?: string | null
  expected_price?: number | null
}

interface WishlistImportRequest {
  mode?: "preview" | "apply"
  targetBoxId?: string | null
  items?: WishlistImportItem[]
}

function normalizeItems(input: unknown): WishlistImportItem[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_IMPORT_SIZE) return null
  const seen = new Set<string>()
  const normalized: WishlistImportItem[] = []

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null
    const item = raw as WishlistImportItem
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!name || name.length > 200) return null
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const description =
      typeof item.description === "string" ? item.description.trim().slice(0, 5_000) || null : null
    const expectedPrice = item.expected_price
    if (
      expectedPrice !== undefined &&
      expectedPrice !== null &&
      (!Number.isFinite(expectedPrice) || expectedPrice < 0 || expectedPrice > MAX_PRICE)
    ) {
      return null
    }
    normalized.push({
      name,
      description,
      expected_price: expectedPrice ?? null,
    })
  }

  return normalized
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session

    const body = (await request.json()) as WishlistImportRequest
    const items = normalizeItems(body.items)
    if (!items) {
      return NextResponse.json(
        { error: `items must contain 1-${MAX_IMPORT_SIZE} valid wishlist entries` },
        { status: 400 }
      )
    }

    const targetBoxId =
      typeof body.targetBoxId === "string" && body.targetBoxId ? body.targetBoxId : null
    if (targetBoxId) {
      const owned = await getOwnedBoxIdSet(supabase, user.id, [targetBoxId])
      if (!owned.has(targetBoxId)) {
        return NextResponse.json({ error: "Target box not found" }, { status: 404 })
      }
    }

    if (body.mode === "preview") {
      const { data, error } = await supabase
        .from("items")
        .select("name, is_wishlist")
        .eq("user_id", user.id)
      if (error) throw error

      const matches = new Map<string, "collection" | "wishlist">()
      for (const row of data ?? []) {
        const key = String(row.name ?? "").trim().toLocaleLowerCase()
        if (!key) continue
        const kind = row.is_wishlist ? "wishlist" : "collection"
        if (!matches.has(key) || kind === "collection") matches.set(key, kind)
      }
      return NextResponse.json({
        items: items.map((item) => ({
          name: item.name,
          existingMatch: matches.get(item.name.toLocaleLowerCase()) ?? null,
        })),
      })
    }

    if (body.mode !== "apply") {
      return NextResponse.json({ error: "mode must be preview or apply" }, { status: 400 })
    }

    const result = await createItems({
      supabase,
      userId: user.id,
      items: items.map((item) => ({
        itemData: {
          name: item.name,
          description: item.description ?? null,
          current_value: null,
          acquisition_date: null,
          acquisition_price: null,
          expected_price: item.expected_price ?? null,
          thumbnail_url: null,
          box_id: null,
          wishlist_target_box_id: targetBoxId,
          user_id: user.id,
          is_wishlist: true,
        },
        photos: [],
        tagIds: [],
      })),
    })

    return NextResponse.json({ success: true, itemIds: result.itemIds })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to import wishlist"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
