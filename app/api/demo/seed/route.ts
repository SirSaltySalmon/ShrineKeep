import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { flattenBoxCopyTreesForAtomicPaste } from "@/lib/api/copy-expand"
import { buildDemoBoxCopyPayloads } from "@/lib/demo/build-demo-paste-trees"
import { ensureDemoTagIds } from "@/lib/demo/ensure-demo-tags"
import { setDashboardDemoPromptDismissed } from "@/lib/demo/set-demo-prompt-dismissed"
import { getEffectiveCap, getSubscriptionStatus } from "@/lib/subscription"

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tagIdsByName = await ensureDemoTagIds(supabase, user.id)
    const trees = buildDemoBoxCopyPayloads(tagIdsByName)
    const { nodes, items, wishlistItems } = flattenBoxCopyTreesForAtomicPaste(trees)

    const { isPro } = await getSubscriptionStatus(supabase, user.id)
    const cap = await getEffectiveCap(supabase, user.id, isPro)
    const rpcCap = Number.isFinite(cap) ? cap : null

    const { data, error } = await supabase.rpc("paste_box_trees_atomic", {
      p_user_id: user.id,
      p_target_parent_box_id: null,
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

    await setDashboardDemoPromptDismissed(supabase, user.id)

    const createdBoxIds = Array.isArray((data as { created_box_ids?: string[] } | null)?.created_box_ids)
      ? (data as { created_box_ids: string[] }).created_box_ids
      : []

    return NextResponse.json({ success: true, createdBoxIds })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to seed demo data"
    console.error("demo seed:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
