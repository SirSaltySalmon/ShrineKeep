import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const revalidate = 120 // Cache for 2 minutes

type ValuePoint = { date: string; value: number }
type AcquisitionPoint = { date: string; cumulativeAcquisition: number }

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boxId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boxId } = await params
    if (!boxId) {
      return NextResponse.json({ error: "boxId required" }, { status: 400 })
    }

    const userId = session.user.id
    const isRoot = boxId === "root"

    let allBoxIds: string[] = []

    if (isRoot) {
      // Root scope: all items (including those in any box / sub-boxes)
      allBoxIds = []
    } else {
      const { data: box } = await supabase
        .from("boxes")
        .select("id")
        .eq("id", boxId)
        .eq("user_id", userId)
        .single()

      if (!box) {
        return NextResponse.json({ error: "Box not found" }, { status: 404 })
      }

      const descendantIds: string[] = []
      let currentLevel: string[] = [boxId]
      while (currentLevel.length > 0) {
        const { data: children } = await supabase
          .from("boxes")
          .select("id")
          .in("parent_box_id", currentLevel)
          .eq("user_id", userId)
        if (!children?.length) break
        const ids = children.map((c) => c.id)
        descendantIds.push(...ids)
        currentLevel = ids
      }
      allBoxIds = [boxId, ...descendantIds]
    }

    const itemsQuery = supabase
      .from("items")
      .select("id, current_value, acquisition_date, acquisition_price")
      .eq("user_id", userId)
      .eq("is_wishlist", false)

    const { data: items } = isRoot
      ? await itemsQuery
      : await itemsQuery.in("box_id", allBoxIds)

    if (!items?.length) {
      return NextResponse.json({
        valueHistory: [] as ValuePoint[],
        acquisitionHistory: [] as AcquisitionPoint[],
        currentValue: 0,
        totalAcquisition: 0,
      })
    }

    const currentValue = items.reduce(
      (sum, i) => sum + (Number(i.current_value) || 0),
      0
    )
    const totalAcquisition = items.reduce(
      (sum, i) => sum + (i.acquisition_price != null ? Number(i.acquisition_price) : 0),
      0
    )

    const itemIds = items.map((i) => i.id)
    const itemCurrentValue = new Map(items.map((i) => [i.id, i.current_value ?? 0]))

    const { data: valueRecords } = await supabase
      .from("value_history")
      .select("item_id, value, recorded_at")
      .in("item_id", itemIds)
      .order("recorded_at", { ascending: true })

    const valueByItem = new Map<string, { recorded_at: string; value: number }[]>()
    const allDates = new Set<string>()
    for (const r of valueRecords ?? []) {
      const key = r.item_id
      if (!valueByItem.has(key)) valueByItem.set(key, [])
      valueByItem.get(key)!.push({
        recorded_at: r.recorded_at,
        value: parseFloat(String(r.value)),
      })
      allDates.add(r.recorded_at.slice(0, 10))
    }
    for (const arr of valueByItem.values()) {
      arr.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    }
    const today = new Date().toISOString().slice(0, 10)
    allDates.add(today)
    const sortedDates = Array.from(allDates).sort()

    function getValueAsOf(itemId: string, dateStr: string): number {
      const records = valueByItem.get(itemId)
      const endOfDay = dateStr + "T23:59:59.999Z"
      if (!records?.length) return itemCurrentValue.get(itemId) ?? 0
      let best = null
      for (const r of records) {
        if (r.recorded_at <= endOfDay) best = r
        else break
      }
      if (best) return best.value
      return dateStr >= today ? (itemCurrentValue.get(itemId) ?? 0) : 0
    }

    const valueHistory: ValuePoint[] = sortedDates.map((date) => ({
      date,
      value: itemIds.reduce((sum, id) => sum + getValueAsOf(id, date), 0),
    }))

    const acquisitionEntries = items
      .filter((i) => i.acquisition_date && i.acquisition_price != null)
      .map((i) => ({
        date: i.acquisition_date!,
        price: parseFloat(String(i.acquisition_price)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const byDate = new Map<string, number>()
    let cumulative = 0
    for (const e of acquisitionEntries) {
      cumulative += e.price
      byDate.set(e.date.slice(0, 10), cumulative)
    }
    const acquisitionHistory: AcquisitionPoint[] = Array.from(byDate.entries())
      .map(([date, cumulativeAcquisition]) => ({ date, cumulativeAcquisition }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      valueHistory,
      acquisitionHistory,
      currentValue,
      totalAcquisition,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load box stats"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
