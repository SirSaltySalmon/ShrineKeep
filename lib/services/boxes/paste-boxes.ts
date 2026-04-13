import type { BoxCopyPayload } from "@/lib/types"

export interface PasteBoxesRequestBody {
  trees?: BoxCopyPayload[]
  sourceRootBoxIds?: string[]
  targetParentBoxId?: string | null
}

export function parsePasteBoxesRequest(body: PasteBoxesRequestBody) {
  return {
    inputTrees: body.trees ?? [],
    sourceRootBoxIds: body.sourceRootBoxIds ?? [],
    targetParentBoxId: body.targetParentBoxId ?? null,
  }
}

export function ensurePasteTreesPresent(
  trees: BoxCopyPayload[],
  sourceRootBoxIds: string[]
) {
  if (trees.length === 0 && sourceRootBoxIds.length === 0) {
    throw new Error("trees array or sourceRootBoxIds array is required")
  }
}
