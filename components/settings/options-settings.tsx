"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { WishlistSharingPanel } from "@/components/wishlist-sharing-panel"
import { ContainerAudienceFields } from "@/components/sharing/container-audience-fields"
import { WishlistVisibilitySummary } from "@/components/sharing/wishlist-visibility-summary"
import type { SharingSettings } from "@/lib/sharing/contracts"

export interface OptionsSettingsProps {
  graphOverlay: boolean
  onGraphOverlayChange: (checked: boolean) => void
  wishlistLinkEnabled: boolean
  wishlistShareToken: string | null
  wishlistApplyColors: boolean
  onLinkEnabledChange: (enabled: boolean) => void
  onApplyColorsChange: (applyColors: boolean) => void
  onShareTokenChange: (token: string | null) => void
  root: SharingSettings
  onRootChange: (next: SharingSettings) => void
  visibleCount: number
  totalCount: number
  onSaveSharing: () => Promise<void>
  onCancelSharing: () => void
  savingSharing?: boolean
  savedSharing?: boolean
}

export function OptionsSettings({
  graphOverlay,
  onGraphOverlayChange,
  wishlistLinkEnabled,
  wishlistShareToken,
  wishlistApplyColors,
  onLinkEnabledChange,
  onApplyColorsChange,
  onShareTokenChange,
  root,
  onRootChange,
  visibleCount,
  totalCount,
  onSaveSharing,
  onCancelSharing,
  savingSharing = false,
  savedSharing = false,
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
          wishlist_apply_colors: wishlistApplyColors,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to save options")
      await onSaveSharing()
      onShareTokenChange((data as { wishlist_share_token?: string | null }).wishlist_share_token ?? wishlistShareToken)
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
          App behavior, display preferences, and sharing.
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

      <div className="space-y-4">
        <div>
          <h3 className="text-fluid-lg font-semibold mb-2">Items not in a box</h3>
          <p className="text-fluid-sm text-muted-foreground mb-4">
            Loose collection items and wishes with no target box belong to this container.
          </p>
          <ContainerAudienceFields
            containerLabel="Items not in a box"
            value={root}
            onChange={onRootChange}
            idPrefix="root"
          />
        </div>
        <WishlistVisibilitySummary visibleCount={visibleCount} totalCount={totalCount} />
      </div>

      <div>
        <h3 className="text-fluid-lg font-semibold mb-2">Share link</h3>
        <p className="text-fluid-sm text-muted-foreground mb-4">
          The link only controls whether the URL works. It does not change who can see items.
        </p>
        <WishlistSharingPanel
          layout="embedded"
          wishlistLinkEnabled={wishlistLinkEnabled}
          wishlistShareToken={wishlistShareToken}
          wishlistApplyColors={wishlistApplyColors}
          onLinkEnabledChange={onLinkEnabledChange}
          onApplyColorsChange={onApplyColorsChange}
          onShareTokenChange={onShareTokenChange}
          onSaveSharing={onSaveSharing}
          onCancelSharing={onCancelSharing}
          savingSharing={savingSharing}
          savedSharing={savedSharing}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {saved && (
          <span className="text-fluid-sm text-muted-foreground self-center">Options saved!</span>
        )}
        <Button type="button" variant="outline" onClick={onCancelSharing} disabled={saving || savingSharing}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || savingSharing}>
          {saving || savingSharing ? "Saving..." : "Save options"}
        </Button>
      </div>
    </div>
  )
}
