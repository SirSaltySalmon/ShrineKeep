"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Copy, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { WishlistVisibilitySummary } from "@/components/sharing/wishlist-visibility-summary"

export interface WishlistSharingPanelProps {
  wishlistLinkEnabled: boolean
  wishlistShareToken: string | null
  wishlistApplyColors: boolean
  onLinkEnabledChange: (enabled: boolean) => void
  onApplyColorsChange: (applyColors: boolean) => void
  onShareTokenChange: (token: string | null) => void
  visibleCount?: number
  totalCount?: number
  /**
   * embedded — under Settings → Options (parent provides “Save options”).
   * card — own bordered section with save on the wishlist page.
   */
  layout?: "embedded" | "card"
  onSaveSharing?: () => Promise<void>
  onCancelSharing?: () => void
  savingSharing?: boolean
  savedSharing?: boolean
  /** Called after a successful save or token regenerate (e.g. router.refresh). */
  onPersisted?: () => void
}

export function WishlistSharingPanel({
  wishlistLinkEnabled,
  wishlistShareToken,
  wishlistApplyColors,
  onLinkEnabledChange,
  onApplyColorsChange,
  onShareTokenChange,
  visibleCount,
  totalCount,
  layout = "embedded",
  onSaveSharing,
  onCancelSharing,
  savingSharing = false,
  savedSharing = false,
  onPersisted,
}: WishlistSharingPanelProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const shareUrl = wishlistShareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/wishlist/${wishlistShareToken}`
    : ""

  const isCard = layout === "card"

  const saveWishlistOnly = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishlist_apply_colors: wishlistApplyColors,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to save sharing settings")
      await onSaveSharing?.()
      onShareTokenChange((data as { wishlist_share_token?: string | null }).wishlist_share_token ?? wishlistShareToken)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onPersisted?.()
      router.refresh()
    } catch (err) {
      console.error("Error saving wishlist sharing:", err)
      alert(err instanceof Error ? err.message : "Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerateToken = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate_wishlist_token: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to regenerate token")
      onShareTokenChange((data as { wishlist_share_token?: string | null }).wishlist_share_token ?? null)
      onPersisted?.()
      router.refresh()
    } catch (err) {
      console.error("Error regenerating token:", err)
      alert("Failed to regenerate token. Please try again.")
    }
  }

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const inner = (
    <div className="space-y-4">
      {isCard && (
        <div>
          <h2 className="text-fluid-lg font-semibold">Wishlist settings</h2>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            The share link only controls whether this URL works.
          </p>
        </div>
      )}

      {visibleCount != null && totalCount != null && (
        <WishlistVisibilitySummary visibleCount={visibleCount} totalCount={totalCount} />
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 min-w-0">
          <Label>Share wishlist by link</Label>
          <p className="text-fluid-xs text-muted-foreground">
            When this is off, the link 404s. Your profile Wishlist tab is unchanged.
          </p>
        </div>
        <Switch
          checked={wishlistLinkEnabled}
          onCheckedChange={onLinkEnabledChange}
          aria-label="Share wishlist by link"
        />
      </div>

      {wishlistLinkEnabled && (
        <div className="space-y-2">
          <Label>Shareable link</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={shareUrl || (isCard ? "Save sharing to get link" : "Save to get link")}
              readOnly
              className="flex-1 min-w-[12rem] font-mono text-fluid-xs"
              disabled={!wishlistShareToken}
            />
            {wishlistShareToken && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? "Copied!" : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateToken}
                  className="shrink-0"
                  aria-label="Regenerate share link"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {wishlistLinkEnabled && (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 min-w-0">
            <Label>Apply custom colors to public view</Label>
            <p className="text-fluid-xs text-muted-foreground">
              Visitors will see your wishlist with your custom color scheme
            </p>
          </div>
          <Switch
            checked={wishlistApplyColors}
            onCheckedChange={onApplyColorsChange}
            aria-label="Apply custom colors to public view"
          />
        </div>
      )}

      {isCard && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {(saved || savedSharing) && (
            <span className="text-fluid-sm text-muted-foreground mr-auto">Sharing settings saved.</span>
          )}
          {onCancelSharing && (
            <Button type="button" variant="outline" onClick={onCancelSharing} disabled={saving || savingSharing}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={saveWishlistOnly} disabled={saving || savingSharing}>
            {saving || savingSharing ? "Saving…" : "Save options"}
          </Button>
        </div>
      )}
    </div>
  )

  if (isCard) {
    return (
      <div
        className={cn(
          "w-full rounded-lg border border-border bg-card text-card-foreground shadow-sm",
          "p-4 sm:p-5 mb-8"
        )}
      >
        {inner}
      </div>
    )
  }

  return inner
}
