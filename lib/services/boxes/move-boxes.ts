import { moveBoxes } from "@/lib/api/move-box"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface MoveBoxesRequestBody {
  boxId?: string
  boxIds?: string[]
  targetParentBoxId?: string | null
}

export function parseMoveBoxesRequest(body: MoveBoxesRequestBody): {
  boxIds: string[]
  targetParentBoxId: string | null
} {
  const targetParentBoxId = body.targetParentBoxId ?? null
  const boxIds = body.boxIds ?? (body.boxId ? [body.boxId] : null)

  if (!boxIds || boxIds.length === 0) {
    throw new Error("boxId or boxIds array is required")
  }

  return { boxIds, targetParentBoxId }
}

export async function moveBoxesForUser(
  supabase: Supabase,
  userId: string,
  body: MoveBoxesRequestBody
) {
  const { boxIds, targetParentBoxId } = parseMoveBoxesRequest(body)
  return moveBoxes(supabase, userId, boxIds, targetParentBoxId)
}
