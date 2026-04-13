import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { BoxCopyPayload } from "@/lib/types"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import {
  expandBoxRefsToTrees,
  flattenBoxCopyTreesForAtomicPaste,
} from "@/lib/api/copy-expand"
import { getEffectiveCap, getSubscriptionStatus } from "@/lib/subscription"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import {
  ensurePasteTreesPresent,
  parsePasteBoxesRequest,
  type PasteBoxesRequestBody,
} from "@/lib/services/boxes/paste-boxes"

/**
 * Paste one or more box trees under targetParentBoxId. Body: { trees: BoxCopyPayload[], targetParentBoxId: string | null }.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as PasteBoxesRequestBody
    const { inputTrees, sourceRootBoxIds, targetParentBoxId } =
      parsePasteBoxesRequest(body)

    if (targetParentBoxId) {
      const ownedParents = await getOwnedBoxIdSet(supabase, user.id, [
        targetParentBoxId,
      ])
      if (!ownedParents.has(targetParentBoxId)) {
        return NextResponse.json(
          { error: "targetParentBoxId must reference one of your boxes" },
          { status: 400 }
        )
      }
    }

    let trees: BoxCopyPayload[] = inputTrees
    if (sourceRootBoxIds.length > 0) {
      trees = await expandBoxRefsToTrees(supabase, user.id, sourceRootBoxIds)
    }

    ensurePasteTreesPresent(trees, sourceRootBoxIds)

    const { isPro } = await getSubscriptionStatus(supabase, user.id)
    const cap = await getEffectiveCap(
      supabase,
      user.id,
      isPro
    )

    const { nodes, items, wishlistItems } = flattenBoxCopyTreesForAtomicPaste(trees)
    const rpcCap = Number.isFinite(cap) ? cap : null

    const { data, error } = await supabase.rpc("paste_box_trees_atomic", {
      p_user_id: user.id,
      p_target_parent_box_id: targetParentBoxId,
      p_cap: rpcCap,
      p_nodes: nodes,
      p_items: items,
      p_wishlist_items: wishlistItems,
    })

    if (error) {
      const match = /item_limit_reached:(\d+):(\d+)/.exec(error.message ?? "")
      if (match) {
        return NextResponse.json(
          {
            error: "item_limit_reached",
            currentCount: Number(match[1]),
            cap: Number(match[2]),
          },
          { status: 403 }
        )
      }
      throw error
    }

    const createdBoxIds = Array.isArray((data as { created_box_ids?: string[] } | null)?.created_box_ids)
      ? (data as { created_box_ids: string[] }).created_box_ids
      : []

    return NextResponse.json({ success: true, createdBoxIds })
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "trees array or sourceRootBoxIds array is required"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof ItemCapExceededError) {
      return NextResponse.json(
        { error: "item_limit_reached", currentCount: error.currentCount, cap: error.cap },
        { status: 403 }
      )
    }

    const message =
      error instanceof Error ? error.message : "Failed to paste box tree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
