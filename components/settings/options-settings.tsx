"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { WishlistSharingPanel } from "@/components/wishlist-sharing-panel"

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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to save options")
      onShareTokenChange((data as { wishlist_share_token?: string | null }).wishlist_share_token ?? null)
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
        <WishlistSharingPanel
          layout="embedded"
          wishlistIsPublic={wishlistIsPublic}
          wishlistShareToken={wishlistShareToken}
          wishlistApplyColors={wishlistApplyColors}
          onPublicChange={onPublicChange}
          onApplyColorsChange={onApplyColorsChange}
          onShareTokenChange={onShareTokenChange}
          onPersisted={() => router.refresh()}
        />
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
