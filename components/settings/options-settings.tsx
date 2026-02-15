"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Copy, RefreshCw } from "lucide-react"

export interface OptionsSettingsProps {
  /** Whether value and acquisition are drawn on one graph (overlay). */
  graphOverlay: boolean
  onGraphOverlayChange: (checked: boolean) => void
  wishlistIsPublic: boolean
  wishlistShareToken: string | null
  wishlistApplyColors: boolean
  onPublicChange: (isPublic: boolean) => void
  onApplyColorsChange: (applyColors: boolean) => void
  onShareTokenChange: (token: string | null) => void
}

export function OptionsSettings({
  graphOverlay,
  onGraphOverlayChange,
  wishlistIsPublic,
  wishlistShareToken,
  wishlistApplyColors,
  onPublicChange,
  onApplyColorsChange,
  onShareTokenChange,
}: OptionsSettingsProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const shareUrl = wishlistShareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/wishlist/${wishlistShareToken}`
    : ""

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph_overlay: graphOverlay,
          wishlist_is_public: wishlistIsPublic,
          wishlist_apply_colors: wishlistApplyColors,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Failed to save options")
      onShareTokenChange(data.wishlist_share_token ?? null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (err) {
      console.error("Error saving options:", err)
      alert(err instanceof Error ? err.message : "Failed to save options. Please try again.")
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
      if (!res.ok) throw new Error(data?.error ?? "Failed to regenerate token")
      onShareTokenChange(data.wishlist_share_token ?? null)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-fluid-xl font-semibold mb-2">Options</h2>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          App behavior, display preferences, and wishlist sharing.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-fluid-lg font-semibold">Charts</h3>
          <p className="text-fluid-sm text-muted-foreground mt-0.5">
            Box stats: draw value and acquisition on one graph or two separate graphs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            id="options-graph-overlay"
            checked={graphOverlay}
            onCheckedChange={onGraphOverlayChange}
          />
          <Label htmlFor="options-graph-overlay" className="text-fluid-sm">
            Draw value and acquisition on one graph (overlay)
          </Label>
        </div>
      </div>

      <div>
        <h3 className="text-fluid-lg font-semibold mb-2">Wishlist</h3>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          Control who can view your wishlist and how it appears.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
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
              <div className="flex gap-2">
                <Input
                  value={shareUrl || "Save to get link"}
                  readOnly
                  className="flex-1 font-mono text-fluid-xs"
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
                      {copied ? "Copied!" : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateToken}
                      className="shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {wishlistIsPublic && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
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
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {saved && (
          <span className="text-fluid-sm text-muted-foreground self-center">Options saved!</span>
        )}
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save options"}
        </Button>
      </div>
    </div>
  )
}
