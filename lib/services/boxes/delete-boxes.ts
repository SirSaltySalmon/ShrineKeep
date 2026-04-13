import { deleteBoxes, type BoxDeleteMode } from "@/lib/api/delete-box"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

type BoxDeletePayload = { boxId: string; mode: BoxDeleteMode }

export interface DeleteBoxesRequestBody {
  boxId?: string
  mode?: BoxDeleteMode
  boxes?: BoxDeletePayload[]
}

export function parseDeleteBoxesRequest(body: DeleteBoxesRequestBody): {
  boxIds: string[]
  mode: BoxDeleteMode
} {
  const list: BoxDeletePayload[] =
    body.boxes ?? (body.boxId && body.mode ? [{ boxId: body.boxId, mode: body.mode }] : [])

  if (list.length === 0) {
    throw new Error("boxId and mode, or boxes array, required")
  }

  for (const { mode } of list) {
    if (mode !== "delete-all" && mode !== "move-to-root") {
      throw new Error("Invalid mode")
    }
  }

  const modes = new Set(list.map((item) => item.mode))
  if (modes.size > 1) {
    throw new Error("All boxes must have the same delete mode in batch operations")
  }

  return { boxIds: list.map((item) => item.boxId), mode: list[0].mode }
}

export async function deleteBoxesForUser(
  supabase: Supabase,
  userId: string,
  body: DeleteBoxesRequestBody
) {
  const { boxIds, mode } = parseDeleteBoxesRequest(body)
  return deleteBoxes(supabase, userId, boxIds, mode)
}
