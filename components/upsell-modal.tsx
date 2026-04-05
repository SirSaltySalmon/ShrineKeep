"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type UpsellReason = "cap_hit" | "ebay_feature_gate"

interface UpsellModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: UpsellReason
}

const COPY: Record<UpsellReason, { title: string; body: string }> = {
  cap_hit: {
    title: "You've built a real collection.",
    body: "Free accounts hold 50 items. Yours is full. Upgrade to Pro for unlimited items.",
  },
  ebay_feature_gate: {
    title: "eBay price lookup is Pro-only.",
    body: "Upgrade to see what your items are worth on the market, based on recent eBay sold listings. Results are suggestions — you confirm or override.",
  },
}

export default function UpsellModal({ open, onOpenChange, reason }: UpsellModalProps) {
  const [loading, setLoading] = useState(false)

  const { title, body } = COPY[reason]

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        console.error("[upsell] No checkout URL returned:", data)
        setLoading(false)
      }
    } catch (err) {
      console.error("[upsell] Checkout error:", err)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {/* Avoid DialogFooter here: its default sm:space-x-2 offsets stacked full-width buttons. */}
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleUpgrade} disabled={loading} className="w-full">
            {loading ? "Redirecting..." : "Upgrade to Pro — $9/month"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
