"use client"

import { useEffect, useState } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { ContainerAudienceFields } from "@/components/sharing/container-audience-fields"
import { WishlistVisibilitySummary } from "@/components/sharing/wishlist-visibility-summary"
import { PRIVATE_SHARING_DEFAULTS, type SharingSettings } from "@/lib/sharing/contracts"
import { parseOwnerSharingSummary, type DashboardOwnerSharing } from "@/lib/sharing/box-editor"

type DeleteMode = "delete-all" | "move-up"

interface BoxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  box: Box | null
  ownerSharing?: DashboardOwnerSharing | null
  descendantCount: number
  onSave: (updated: { id: string; name: string; description: string | null; sharing: SharingSettings }) => void
  onDeleted: (box: Box) => void
  onOwnerSharingChange?: (sharing: Extract<DashboardOwnerSharing, { available: true }>) => void
}

export default function BoxDialog({
  open,
  onOpenChange,
  box,
  ownerSharing,
  descendantCount,
  onSave,
  onDeleted,
  onOwnerSharingChange,
}: BoxDialogProps) {
  const supabase = createSupabaseClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [sharing, setSharing] = useState<SharingSettings>(PRIVATE_SHARING_DEFAULTS)
  const [sharingRevision, setSharingRevision] = useState("0")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")

  useEffect(() => {
    if (!open || !box) return
    setName(box.name || "")
    setDescription(box.description || "")
    setSharing(box.sharing ?? PRIVATE_SHARING_DEFAULTS)
    setSharingRevision(ownerSharing?.available ? ownerSharing.revision : "0")
    setConfirmingDelete(false)
    setDeleteMode(null)
    setDeleteConfirmName("")
  }, [box, open, ownerSharing])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmingDelete(false)
      setDeleteMode(null)
      setDeleteConfirmName("")
    }
    onOpenChange(nextOpen)
  }

  const handleSave = async () => {
    if (!box || !name.trim()) return
    setSaving(true)
    try {
      if (ownerSharing?.available) {
        const sharingSnapshot = ownerSharing
        const shareRes = await fetch(`/api/boxes/${box.id}/sharing`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionVisibility: sharing.collectionVisibility,
            wishlistVisibility: sharing.wishlistVisibility,
            shareFinancials: sharing.shareFinancials,
            applyToDescendants: true,
            expectedRevision: sharingRevision,
            expectedDescendantCount: descendantCount,
          }),
        })
        const shareData = await shareRes.json().catch(() => ({}))
        if (!shareRes.ok) {
          const code = (shareData as { error?: { code?: string } })?.error?.code
          throw new Error(code === "revision_conflict"
            ? "Sharing settings changed in another tab. Reload and try again."
            : "Failed to save sharing settings")
        }
        const next = shareData as { revision?: string }
        if (next.revision) setSharingRevision(next.revision)
        const ownerRes = await fetch("/api/settings/profile")
        if (ownerRes.ok) {
          const parsed = parseOwnerSharingSummary(await ownerRes.json())
          if (parsed) {
            onOwnerSharingChange?.(parsed)
            setSharingRevision(parsed.revision)
          }
        } else if (next.revision) {
          onOwnerSharingChange?.({ ...sharingSnapshot, revision: next.revision })
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const trimmedName = name.trim()
      const trimmedDescription = description.trim() || null
      const { error } = await supabase
        .from("boxes")
        .update({
          name: trimmedName,
          description: trimmedDescription,
        })
        .eq("id", box.id)
        .eq("user_id", user.id)

      if (error) throw error
      onSave({
        id: box.id,
        name: trimmedName,
        description: trimmedDescription,
        sharing,
      })
      handleOpenChange(false)
    } catch (error) {
      console.error("Error saving box:", error)
      alert(error instanceof Error ? error.message : "Failed to save box. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!box || !deleteMode || deleteConfirmName.trim() !== box.name) return
    setDeleting(true)
    try {
      const res = await fetch("/api/boxes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxId: box.id, mode: deleteMode }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to delete box")
      }
      onDeleted(box)
      handleOpenChange(false)
    } catch (e) {
      console.error("Error deleting box:", e)
      alert(e instanceof Error ? e.message : "Failed to delete box. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const moveUpCopy = box?.parent_box_id
    ? "into the box above it"
    : "to the top level"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>{confirmingDelete ? "Delete Box" : "Edit Box"}</DialogTitle>
          <DialogDescription>
            {confirmingDelete
              ? "Choose how to handle this box and its contents. This cannot be undone."
              : "Update box details"}
          </DialogDescription>
        </DialogHeader>

        {confirmingDelete ? (
          <div className="space-y-4 py-4 layout-shrink-visible">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setDeleteMode("delete-all")}
                className={cn(
                  "w-full rounded-md border border-input bg-background p-3 text-left transition-colors hover:bg-accent",
                  deleteMode === "delete-all" && "ring-2 ring-inset ring-primary",
                )}
              >
                <div className="text-fluid-sm font-medium">Delete all</div>
                <p className="text-fluid-xs text-muted-foreground mt-1 break-words">
                  Permanently delete this box and all child items, sub-boxes, and their data (value history, photos, etc.).
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeleteMode("move-up")}
                className={cn(
                  "w-full rounded-md border border-input bg-background p-3 text-left transition-colors hover:bg-accent",
                  deleteMode === "move-up" && "ring-2 ring-inset ring-primary",
                )}
              >
                <div className="text-fluid-sm font-medium">Move contents up</div>
                <p className="text-fluid-xs text-muted-foreground mt-1 break-words">
                  Move this box&apos;s items and sub-boxes {moveUpCopy}, then delete this box.
                  Anything inside will follow the parent&apos;s sharing settings, which may make it visible to more people.
                </p>
              </button>
            </div>
            {deleteMode != null && (
              <div className="min-w-0">
                <Label htmlFor="box-dialog-delete-confirm">
                  Type the box name to confirm: <strong className="break-all">{box?.name}</strong>
                </Label>
                <Input
                  id="box-dialog-delete-confirm"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Box name"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4 layout-shrink-visible">
            <div className="min-w-0">
              <Label htmlFor="box-dialog-name">Name *</Label>
              <Input
                id="box-dialog-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Box name"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="box-dialog-description">Description</Label>
              <Input
                id="box-dialog-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Box description"
              />
            </div>
            {ownerSharing?.available && box && (
              <div className="border-t pt-4 space-y-4">
                <ContainerAudienceFields
                  containerLabel={box.name}
                  value={sharing}
                  onChange={setSharing}
                  idPrefix={`box-${box.id}`}
                />
                <WishlistVisibilitySummary
                  visibleCount={ownerSharing.wishlistGuestVisibleCount}
                  totalCount={ownerSharing.wishlistGuestTotalCount}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {confirmingDelete ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmingDelete(false)
                  setDeleteMode(null)
                  setDeleteConfirmName("")
                }}
                disabled={deleting}
                className="mr-auto"
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={
                  deleting ||
                  deleteMode == null ||
                  deleteConfirmName.trim() !== (box?.name ?? "")
                }
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "Deleting..." : "Confirm delete"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving || deleting}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving || deleting}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || deleting || !name.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
