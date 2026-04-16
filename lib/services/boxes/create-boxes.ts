import { createBoxes } from "@/lib/api/create-box"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface BoxCreateRequest {
  name: string
  description?: string | null
  parent_box_id?: string | null
  position?: number
}

export interface BoxesBatchCreateRequest {
  boxes: BoxCreateRequest[]
}

export function parseCreateBoxesRequest(body: BoxCreateRequest | BoxesBatchCreateRequest): BoxCreateRequest[] {
  if ("boxes" in body) {
    if (!Array.isArray(body.boxes)) {
      throw new Error("boxes must be an array")
    }
    if (body.boxes.length === 0) {
      throw new Error("boxes array must not be empty")
    }
    for (const box of body.boxes) {
      if (!box.name || !box.name.trim()) {
        throw new Error("Name is required for all boxes")
      }
    }
    return body.boxes
  }

  const { name, description, parent_box_id, position } = body
  if (!name || !name.trim()) {
    throw new Error("Name is required")
  }
  return [{ name, description, parent_box_id, position }]
}

export async function createBoxesForUser(
  supabase: Supabase,
  userId: string,
  body: BoxCreateRequest | BoxesBatchCreateRequest
) {
  const input = parseCreateBoxesRequest(body)
  const boxIds = await createBoxes(supabase, userId, input)
  return { boxIds, isBatch: "boxes" in body && Array.isArray(body.boxes) }
}
