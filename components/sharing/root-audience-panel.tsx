"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ContainerAudienceFields } from "@/components/sharing/container-audience-fields"
import {
  laterSharingRevision,
  overlayOwnerSharingSnapshot,
  parseOwnerSharingSummary,
  type DashboardOwnerSharing,
} from "@/lib/sharing/box-editor"
import type { SharingSettings } from "@/lib/sharing/contracts"

type AvailableOwnerSharing = Extract<DashboardOwnerSharing, { available: true }>

export interface RootAudiencePanelProps {
  ownerSharing: AvailableOwnerSharing
  onOwnerSharingChange?: (sharing: AvailableOwnerSharing) => void
}

export function RootAudiencePanel({
  ownerSharing,
  onOwnerSharingChange,
}: RootAudiencePanelProps) {
  const [root, setRoot] = useState<SharingSettings>(ownerSharing.root)
  const [sharingRevision, setSharingRevision] = useState(ownerSharing.revision)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setRoot(ownerSharing.root)
  }, [ownerSharing.root])

  useEffect(() => {
    setSharingRevision((prev) => laterSharingRevision(ownerSharing.revision, prev))
  }, [ownerSharing.revision])

  const restore = () => {
    setRoot(ownerSharing.root)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: ownerSharing.nickname,
          bio: ownerSharing.bio,
          profileShareStyle: ownerSharing.profileShareStyle,
          root,
          wishlistLinkEnabled: ownerSharing.wishlistLinkEnabled,
          wishlistShareToken: null,
          expectedRevision: sharingRevision,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = (data as { error?: { code?: string } })?.error?.code
        throw new Error(code === "revision_conflict"
          ? "Sharing settings changed in another tab. Reload and try again."
          : "Failed to save sharing settings")
      }
      const next = data as { revision?: string }
      let parsed: ReturnType<typeof parseOwnerSharingSummary> = null
      const ownerRes = await fetch("/api/settings/profile")
      if (ownerRes.ok) {
        parsed = parseOwnerSharingSummary(await ownerRes.json())
      }
      const updated = overlayOwnerSharingSnapshot(ownerSharing, next.revision, parsed, { root })
      onOwnerSharingChange?.(updated)
      setSharingRevision(updated.revision)
      setRoot(updated.root)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error("Error saving root sharing:", error)
      alert(error instanceof Error ? error.message : "Failed to save sharing settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8 w-full flex justify-center">
      <div className="mt-8 w-full max-w-2xl mx-auto">
        <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-4 sm:p-5 mb-8">
          <div className="space-y-4">
            <div>
              <h2 className="text-fluid-lg font-semibold">Root box</h2>
              <p className="text-fluid-sm text-muted-foreground mt-0.5">
                Visibility settings here act as the parent setting for all boxes and loose objects without a box. Learn more in a future blog post...
              </p>
            </div>
            <ContainerAudienceFields
              containerLabel="Items not in a box"
              value={root}
              onChange={setRoot}
              idPrefix="root"
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              {saved && (
                <span className="text-fluid-sm text-muted-foreground mr-auto">Sharing settings saved.</span>
              )}
              <Button type="button" variant="outline" onClick={restore} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save options"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
