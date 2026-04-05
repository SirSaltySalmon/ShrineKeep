"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE, FREE_TIER_CAP } from "@/lib/subscription"

interface SubscriptionData {
  isPro: boolean
  status: "active" | "canceled" | "past_due" | null
  currentPeriodEnd: string | null
  pastDueGraceDays?: number
  pastDueGraceEndsAt?: string | null
  cancelAtPeriodEnd: boolean
  /** Stripe `cancel_at` when set (ISO); use for end date when portal uses `cancel_at` without `cancel_at_period_end`. */
  cancelAt?: string | null
  itemCount: number
  cap: number | null
}

export default function BillingSettings() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [endNowOpen, setEndNowOpen] = useState(false)
  const [endNowPhrase, setEndNowPhrase] = useState("")
  const [endNowLoading, setEndNowLoading] = useState(false)
  const [endNowError, setEndNowError] = useState<string | null>(null)

  const loadSubscription = () =>
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((d) => setData(d))

  useEffect(() => {
    loadSubscription().catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleManage = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const d = await res.json()
      if (d.url) window.location.href = d.url
    } catch (err) {
      console.error("[billing] portal error:", err)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleUpgrade = async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" })
      const d = await res.json()
      if (d.url) window.location.href = d.url
    } catch (err) {
      console.error("[billing] checkout error:", err)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const phraseMatches = endNowPhrase === END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE

  const handleEndNowOpenChange = (open: boolean) => {
    setEndNowOpen(open)
    if (!open) {
      setEndNowPhrase("")
      setEndNowError(null)
    }
  }

  const handleEndNow = async () => {
    if (!phraseMatches) return
    setEndNowLoading(true)
    setEndNowError(null)
    try {
      const res = await fetch("/api/stripe/subscription/end-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: endNowPhrase }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEndNowError(typeof payload.error === "string" ? payload.error : "Something went wrong")
        return
      }
      handleEndNowOpenChange(false)
      setLoading(true)
      await loadSubscription()
      setLoading(false)
    } catch (err) {
      console.error("[billing] end now error:", err)
      setEndNowError("Network error. Try again.")
    } finally {
      setEndNowLoading(false)
    }
  }

  if (loading) {
    return <p className="text-fluid-sm text-muted-foreground">Loading billing info...</p>
  }

  const cap = data?.cap ?? FREE_TIER_CAP
  const scheduledEndDateIso = data?.cancelAt ?? data?.currentPeriodEnd ?? null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-fluid-xl font-semibold mb-1">Billing</h2>
        <p className="text-fluid-sm text-muted-foreground">
          Manage your ShrineKeep subscription.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-fluid-sm font-medium">
              {data?.isPro ? "ShrineKeep Pro" : "Free plan"}
            </p>
            {data?.isPro && data.status === "past_due" && (
              <p className="text-fluid-xs text-amber-600 mt-0.5">
                {data.pastDueGraceEndsAt && typeof data.pastDueGraceDays === "number" ? (
                  <>
                    Payment past due — Pro stays on for {data.pastDueGraceDays}{" "}
                    {data.pastDueGraceDays === 1 ? "day" : "days"} after your billing period ended, through{" "}
                    {new Date(data.pastDueGraceEndsAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    .
                  </>
                ) : (
                  <>Payment past due — your Pro access may still be active for a limited grace period.</>
                )}
              </p>
            )}
            {data?.isPro && data.currentPeriodEnd && data.status === "active" && !data.cancelAtPeriodEnd && (
              <p className="text-fluid-xs text-muted-foreground mt-0.5">
                Renews {new Date(data.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {data?.isPro && scheduledEndDateIso && data.cancelAtPeriodEnd && (
              <p className="text-fluid-xs text-muted-foreground mt-0.5">
                Scheduled to end {new Date(scheduledEndDateIso).toLocaleDateString()}
              </p>
            )}
            {!data?.isPro && (
              <p className="text-fluid-xs text-muted-foreground mt-0.5">
                {data?.itemCount ?? 0} of {cap} items used
              </p>
            )}
          </div>
          {data?.isPro ? (
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
              {data.cancelAtPeriodEnd && (
                <Button
                  variant="destructive"
                  className="order-first sm:order-none"
                  onClick={() => handleEndNowOpenChange(true)}
                >
                  End subscription now
                </Button>
              )}
              <Button variant="outline" onClick={handleManage} disabled={portalLoading}>
                {portalLoading ? "Opening..." : "Manage subscription"}
              </Button>
            </div>
          ) : (
            <Button onClick={handleUpgrade} disabled={checkoutLoading}>
              {checkoutLoading ? "Redirecting..." : "Upgrade to Pro — $9/month"}
            </Button>
          )}
        </div>
      </div>

      {!data?.isPro && (
        <div className="text-fluid-sm text-muted-foreground space-y-1">
          <p>Pro includes:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Unlimited items</li>
            <li>eBay price lookup (coming soon)</li>
          </ul>
        </div>
      )}

      <Dialog open={endNowOpen} onOpenChange={handleEndNowOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>End subscription immediately</DialogTitle>
            <DialogDescription>
              Your Pro access will end right away. This cannot be undone. Type the sentence below exactly
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="end-sub-confirm" className="text-fluid-xs text-muted-foreground">
              Confirmation phrase
            </Label>
            <Input
              id="end-sub-confirm"
              value={endNowPhrase}
              onChange={(e) => setEndNowPhrase(e.target.value)}
              placeholder={END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE}
              autoComplete="off"
              disabled={endNowLoading}
            />
            <p className="text-fluid-xs text-muted-foreground font-mono break-words">
              {END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE}
            </p>
            {endNowError && <p className="text-fluid-sm text-destructive">{endNowError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleEndNowOpenChange(false)} disabled={endNowLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!phraseMatches || endNowLoading}
              onClick={handleEndNow}
            >
              {endNowLoading ? "Ending…" : "End subscription now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
