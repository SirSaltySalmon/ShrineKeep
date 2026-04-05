"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Copy, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WishlistSharingPanelProps {
  wishlistIsPublic: boolean
  wishlistShareToken: string | null
  wishlistApplyColors: boolean
  onPublicChange: (isPublic: boolean) => void
  onApplyColorsChange: (applyColors: boolean) => void
  onShareTokenChange: (token: string | null) => void
  /**
   * embedded — under Settings → Options (parent provides “Save options”).
   * card — own bordered section with “Save sharing” on the wishlist page.
   */
  layout?: "embedded" | "card"
  /** Called after a successful save or token regenerate (e.g. router.refresh). */
  onPersisted?: () => void
}

export function WishlistSharingPanel({
  wishlistIsPublic,
  wishlistShareToken,
  wishlistApplyColors,
  onPublicChange,
  onApplyColorsChange,
  onShareTokenChange,
  layout = "embedded",
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
          wishlist_is_public: wishlistIsPublic,
          wishlist_apply_colors: wishlistApplyColors,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to save sharing settings")
      onShareTokenChange((data as { wishlist_share_token?: string | null }).wishlist_share_token ?? null)
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
            Control who can view your wishlist and how it appears.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 min-w-0">
          <Label>Make wishlist public</Label>
          <p className="text-fluid-xs text-muted-foreground">
            Allow others to view your wishlist via a shareable link
          </p>
        </div>
        <Switch
          checked={wishlistIsPublic}
          onCheckedChange={onPublicChange}
          aria-label="Make wishlist public"
        />
      </div>

      {wishlistIsPublic && (
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

      {wishlistIsPublic && (
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
          {saved && (
            <span className="text-fluid-sm text-muted-foreground mr-auto">Sharing settings saved.</span>
          )}
          <Button type="button" onClick={saveWishlistOnly} disabled={saving}>
            {saving ? "Saving…" : "Save options"}
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
