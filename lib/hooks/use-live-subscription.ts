"use client"

import { useCallback, useEffect, useState } from "react"
import { PAST_DUE_GRACE_DAYS } from "@/lib/subscription"

interface UseLiveSubscriptionParams {
  itemCount: number
  isPro: boolean
  subscriptionStatus: "active" | "canceled" | "past_due" | null
  pastDueGraceEndsAt: string | null
}

export function useLiveSubscription({
  itemCount,
  isPro,
  subscriptionStatus,
  pastDueGraceEndsAt,
}: UseLiveSubscriptionParams) {
  const [liveItemCount, setLiveItemCount] = useState(itemCount)
  const [liveIsPro, setLiveIsPro] = useState(isPro)
  const [liveSubscriptionStatus, setLiveSubscriptionStatus] = useState(subscriptionStatus)
  const [livePastDueGraceEndsAt, setLivePastDueGraceEndsAt] = useState<string | null>(
    pastDueGraceEndsAt
  )
  const [pastDueGraceDays, setPastDueGraceDays] = useState(PAST_DUE_GRACE_DAYS)

  useEffect(() => {
    setLiveItemCount(itemCount)
  }, [itemCount])

  useEffect(() => {
    setLiveIsPro(isPro)
    setLiveSubscriptionStatus(subscriptionStatus)
    setLivePastDueGraceEndsAt(pastDueGraceEndsAt)
    setPastDueGraceDays(PAST_DUE_GRACE_DAYS)
  }, [isPro, subscriptionStatus, pastDueGraceEndsAt])

  const refreshSubscriptionCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription")
      if (!res.ok) return
      const data = (await res.json()) as {
        itemCount?: number
        pastDueGraceEndsAt?: string | null
        pastDueGraceDays?: number
        isPro?: boolean
        status?: "active" | "canceled" | "past_due" | null
      }
      if (typeof data.itemCount === "number") {
        setLiveItemCount(data.itemCount)
      }
      if (data.pastDueGraceEndsAt !== undefined) {
        setLivePastDueGraceEndsAt(data.pastDueGraceEndsAt)
      }
      if (typeof data.pastDueGraceDays === "number") {
        setPastDueGraceDays(data.pastDueGraceDays)
      }
      if (typeof data.isPro === "boolean") {
        setLiveIsPro(data.isPro)
      }
      if (data.status !== undefined) {
        setLiveSubscriptionStatus(data.status)
      }
    } catch {
      // Ignore transient fetch failures; UI will retry on next refresh trigger.
    }
  }, [])

  return {
    liveItemCount,
    liveIsPro,
    liveSubscriptionStatus,
    livePastDueGraceEndsAt,
    pastDueGraceDays,
    refreshSubscriptionCounts,
  }
}
