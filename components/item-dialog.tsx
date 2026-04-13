"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import * as Sentry from "@sentry/nextjs"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item, Photo, Tag, TAG_COLORS, type TagColor } from "@/lib/types"
import { sortTagsByColorThenName, getTagChipStyle } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, Search as SearchIcon, Trash2, LayoutGrid, Plus, X, Link as LinkIcon } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"
import { ThumbnailBadge, ThumbnailActionButtons } from "./thumbnail-content"
import ImageSearch from "./image-search"
import ImageGalleryCarousel from "./image-gallery-carousel"
import ValueGraph from "./value-graph"
import BoxPickerDialog from "./box-picker-dialog"

const MAX_PHOTOS = 10
const MAX_TAGS_PER_USER = 256

/** Local photo for form state (id only present when loaded from DB). */
interface LocalPhoto {
  id?: string
  url: string
  storage_path?: string // Storage path for Supabase storage files
  is_thumbnail: boolean
}

function toLocalPhotos(item: Item | null): LocalPhoto[] {
  if (!item) return []
  const photos = item.photos as Photo[] | undefined
  if (photos?.length) {
    const sorted = [...photos].sort(
      (a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    )
    const hasThumb = sorted.some((p) => p.is_thumbnail)
    return sorted.map((p) => ({
      id: p.id,
      url: p.url,
      storage_path: (p as any).storage_path,
      is_thumbnail: p.is_thumbnail || (!hasThumb && p === sorted[0]),
    }))
  }
  if (item.thumbnail_url) {
    return [{ url: item.thumbnail_url, is_thumbnail: true }]
  }
  return []
}

interface ItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Item | null
  isNew: boolean
  boxId: string | null
  onSave: () => void
  /** True on the dedicated wishlist page: no collection/wishlist toggle for new items. */
  isWishlist?: boolean
  /** When creating from the dashboard (root or a box; not wishlist page), initial mode for the Item Type toggle. */
  defaultNewItemMode?: "collection" | "wishlist"
  /** Called when the server returns 403 (item cap reached). Dialog closes before this fires. */
  onCapReached?: () => void
}

export default function ItemDialog({
  open,
  onOpenChange,
  item,
  isNew,
  boxId,
  onSave,
  isWishlist = false,
  defaultNewItemMode = "collection",
  onCapReached,
}: ItemDialogProps) {
  const supabase = createSupabaseClient()
  /** Collection vs wishlist when creating an item (root or inside a box); wishlist page locks to wishlist. */
  const canSwitchNewItemMode = isNew && !isWishlist
  const [newItemMode, setNewItemMode] = useState<"collection" | "wishlist">(() => defaultNewItemMode)
  const editingWishlistItem = !isNew && !!item?.is_wishlist
  const effectiveIsWishlist =
    isWishlist || editingWishlistItem || (canSwitchNewItemMode && newItemMode === "wishlist")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [currentValue, setCurrentValue] = useState("")
  const [acquisitionDate, setAcquisitionDate] = useState("")
  const [acquisitionPrice, setAcquisitionPrice] = useState("")
  const [expectedPrice, setExpectedPrice] = useState("")
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showImageSearch, setShowImageSearch] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInputValue, setUrlInputValue] = useState("")
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [wishlistTargetBoxId, setWishlistTargetBoxId] = useState<string | null>(null)
  const [wishlistTargetBoxName, setWishlistTargetBoxName] = useState<string | null>(null)
  const [showBoxPicker, setShowBoxPicker] = useState(false)
  const [userTags, setUserTags] = useState<Tag[]>([])
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false)
  const [showCreateTag, setShowCreateTag] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState<TagColor>("blue")
  // Track photos uploaded during this session that haven't been saved yet
  const [unsavedUploadedPhotos, setUnsavedUploadedPhotos] = useState<Set<string>>(new Set())
  // Use ref to track unsaved uploads for cleanup (avoids stale closure issues)
  const unsavedUploadsRef = useRef<Set<string>>(new Set())
  const uploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isNew) return
    if (isWishlist) {
      setNewItemMode("wishlist")
      return
    }
    setNewItemMode(defaultNewItemMode)
  }, [isNew, isWishlist, open, defaultNewItemMode])

  // Update ref whenever state changes
  useEffect(() => {
    unsavedUploadsRef.current = unsavedUploadedPhotos
  }, [unsavedUploadedPhotos])

  // Cleanup function to delete unsaved uploaded files via server API
  const cleanupUnsavedUploads = useCallback(async () => {
    const pathsToDelete = Array.from(unsavedUploadsRef.current)
    if (pathsToDelete.length === 0) return
    
    setUnsavedUploadedPhotos(new Set())
    unsavedUploadsRef.current = new Set()
    
    // Call server API to cleanup unsaved uploads
    try {
      const response = await fetch("/api/storage/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storage_paths: pathsToDelete }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Failed to cleanup storage:", errorData.error)
      }
    } catch (error) {
      console.error("Error calling cleanup API:", error)
      Sentry.captureException(error, {
        tags: {
          area: "items",
          operation: "cleanup_unsaved_uploads",
        },
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return

    if (item && !isNew) {
      setName(item.name || "")
      setDescription(item.description || "")
      setCurrentValue(item.current_value?.toString() || "")
      setAcquisitionDate(item.acquisition_date || "")
      setAcquisitionPrice(item.acquisition_price?.toString() || "")
      setExpectedPrice(item.expected_price?.toString() || "")
      setPhotos(toLocalPhotos(item))
      setSelectedTagIds(item.tags?.map((t) => t.id) ?? [])
      setWishlistTargetBoxId(item.wishlist_target_box_id ?? null)
      setUnsavedUploadedPhotos(new Set()) // Clear unsaved uploads when loading existing item
      unsavedUploadsRef.current = new Set()
    } else if (isNew) {
      const startWishlistLike = isWishlist || defaultNewItemMode === "wishlist"
      setName("")
      setDescription("")
      setCurrentValue("")
      setAcquisitionDate(startWishlistLike ? "" : new Date().toISOString().split("T")[0])
      setAcquisitionPrice("")
      setExpectedPrice("")
      setPhotos([])
      setSelectedTagIds([])
      setWishlistTargetBoxId(
        !isWishlist && defaultNewItemMode === "wishlist" && boxId ? boxId : null
      )
      setUnsavedUploadedPhotos(new Set()) // Clear unsaved uploads for new items
      unsavedUploadsRef.current = new Set()
    }
    setShowCreateTag(false)
    setNewTagName("")
    setNewTagColor("blue")
  }, [item, isNew, open, isWishlist, defaultNewItemMode, boxId])

  const handleNewItemModeSwitch = (mode: "collection" | "wishlist") => {
    if (!canSwitchNewItemMode || mode === newItemMode) return
    if (mode === "wishlist") {
      setExpectedPrice((ep) => {
        const t = acquisitionPrice.trim()
        if (t) return acquisitionPrice
        return ep.trim() ? ep : ""
      })
      setWishlistTargetBoxId(boxId ?? null)
    } else {
      // Wishlist → collection: expected price is what the user last saw/edited there, so it wins over stale acquisition.
      setAcquisitionPrice((ap) => {
        const et = expectedPrice.trim()
        if (et) return expectedPrice
        return ap.trim() ? ap : ""
      })
      setAcquisitionDate((d) => {
        const t = d.trim()
        return t ? d : new Date().toISOString().split("T")[0]
      })
      setWishlistTargetBoxId(null)
    }
    setNewItemMode(mode)
  }

  useEffect(() => {
    if (!open) return
    if (!wishlistTargetBoxId) {
      setWishlistTargetBoxName(null)
      return
    }

    const loadWishlistTargetName = async () => {
      try {
        const { data } = await supabase
          .from("boxes")
          .select("name")
          .eq("id", wishlistTargetBoxId)
          .single()
        setWishlistTargetBoxName(data?.name ?? null)
      } catch {
        setWishlistTargetBoxName(null)
      }
    }

    void loadWishlistTargetName()
  }, [open, supabase, wishlistTargetBoxId])

  // Fetch user tags when dialog opens
  useEffect(() => {
    if (!open) return
    const fetchTags = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("tags").select("*").eq("user_id", user.id)
      setUserTags(sortTagsByColorThenName(data ?? []))
    }
    fetchTags()
  }, [open, supabase])

  // Cleanup on dialog close/cancel - delete any unsaved uploaded files
  useEffect(() => {
    if (!open) {
      // Dialog is closing - cleanup any unsaved uploads
      cleanupUnsavedUploads()
    }
  }, [open, cleanupUnsavedUploads])

  const addPhoto = (url: string, setAsThumbnail = false) => {
    setPhotos((prev) => {
      if (prev.length >= MAX_PHOTOS) return prev
      const next = prev.map((p) => ({ ...p, is_thumbnail: setAsThumbnail ? false : p.is_thumbnail }))
      next.push({ url, is_thumbnail: setAsThumbnail || prev.length === 0 })
      return next
    })
  }

  const validateUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === "http:" || urlObj.protocol === "https:"
    } catch {
      return false
    }
  }

  const handleAddUrl = () => {
    const trimmedUrl = urlInputValue.trim()
    if (!trimmedUrl) {
      alert("Please enter a URL")
      return
    }

    if (!validateUrl(trimmedUrl)) {
      alert("Please enter a valid URL (must start with http:// or https://)")
      return
    }

    addPhoto(trimmedUrl, photos.length === 0)
    setUrlInputValue("")
    setShowUrlInput(false)
  }

  const setThumbnailIndex = (index: number) => {
    setPhotos((prev) =>
      prev.map((p, i) => ({ ...p, is_thumbnail: i === index }))
    )
  }

  const removePhoto = async (index: number) => {
    const photoToRemove = photos[index]
    
    // Handle deletion based on photo type:
    // 1. Saved photo (has id and storage_path) -> delete from database and storage
    // 2. Unsaved photo (no id but has storage_path) -> delete from storage only
    // 3. External URL (no storage_path) -> just remove from UI
    
    if (photoToRemove.storage_path) {
      try {
        if (photoToRemove.id) {
          // Saved photo: delete from database and storage
          const response = await fetch("/api/photos/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ photoId: photoToRemove.id }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error("Failed to delete photo:", errorData.error)
            alert(`Failed to delete photo: ${errorData.error || "Unknown error"}`)
            return // Don't remove from UI if deletion failed
          }
        } else {
          // Unsaved photo: delete from storage only
          const response = await fetch("/api/storage/cleanup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ storage_paths: [photoToRemove.storage_path] }),
          })

          if (!response.ok) {
            console.error("Failed to delete photo from storage")
            // Still remove from UI even if storage deletion fails (it's unsaved)
          } else {
            // Remove from unsaved uploads tracking
            setUnsavedUploadedPhotos((prev) => {
              const next = new Set(prev)
              next.delete(photoToRemove.storage_path!)
              unsavedUploadsRef.current = next
              return next
            })
          }
        }
      } catch (error) {
        console.error("Failed to delete photo:", error)
        Sentry.captureException(error, {
          tags: {
            area: "items",
            operation: "delete_photo",
          },
        })
        if (photoToRemove.id) {
          // For saved photos, show error and don't remove from UI
          alert("Failed to delete photo. Please try again.")
          return
        }
        // For unsaved photos, continue with removal from UI
      }
    }
    
    // Remove photo from UI
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index)
      const hadThumb = prev[index].is_thumbnail
      if (hadThumb && next.length > 0 && !next.some((p) => p.is_thumbnail)) {
        next[0].is_thumbnail = true
      }
      return next
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    const toAdd = Math.min(MAX_PHOTOS - photos.length, files.length)
    if (toAdd <= 0) {
      alert(`Maximum ${MAX_PHOTOS} images per item.`)
      return
    }

    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert("You must be logged in to upload images.")
      return
    }

    setUploading(true)
    const newPhotos: LocalPhoto[] = []
    for (let i = 0; i < toAdd; i++) {
      const file = files[i]
      if (file.size > 4 * 1024 * 1024) {
        alert(`"${file.name}" is larger than 4MB and was skipped.`)
        continue
      }
      const fileExt = file.name.split(".").pop()
      const fileName = `${Math.random()}.${fileExt}`
      // Use user-specific path: {user_id}/items/{filename}
      const filePath = `${user.id}/items/${fileName}`
      const { error } = await supabase.storage.from("item-photos").upload(filePath, file)
      if (error) {
        console.error("Upload error:", error)
        Sentry.captureException(error, {
          tags: {
            area: "items",
            operation: "upload_photo",
          },
        })
        alert(`Failed to upload "${file.name}": ${error.message}`)
        continue
      }
      
      // For wishlist items, use public URL (accessible via storage policy)
      // For private items, use signed URL (valid for 1 year)
      let url: string
      if (effectiveIsWishlist) {
        // Wishlist items: use public URL (policy allows public access)
        const { data: publicUrlData } = supabase.storage.from("item-photos").getPublicUrl(filePath)
        url = publicUrlData.publicUrl
      } else {
        // Private items: use signed URL
        const { data: signedUrlData } = await supabase.storage
          .from("item-photos")
          .createSignedUrl(filePath, 31536000) // 1 year expiration
        
        if (signedUrlData?.signedUrl) {
          url = signedUrlData.signedUrl
        } else {
          console.error("Failed to generate signed URL for:", filePath)
          // Fallback to public URL (shouldn't happen, but just in case)
          const { data: publicUrlData } = supabase.storage.from("item-photos").getPublicUrl(filePath)
          url = publicUrlData.publicUrl
        }
      }
      newPhotos.push({ 
        url, 
        storage_path: filePath,
        is_thumbnail: false 
      })
      // Track this as an unsaved upload
      setUnsavedUploadedPhotos((prev) => {
        const next = new Set(prev).add(filePath)
        unsavedUploadsRef.current = next
        return next
      })
    }
    setPhotos((prev) => {
      const next = [...prev]
      const needThumb = next.length === 0
      newPhotos.forEach((photo, i) => {
        if (next.length >= MAX_PHOTOS) return
        next.push({ 
          ...photo, 
          is_thumbnail: needThumb && i === 0 
        })
      })
      return next
    })
    setUploading(false)
    e.target.value = ""
  }

  const handleSave = async () => {
    if (!name.trim()) return

    setSaving(true)

    try {
      const currentValueNum = currentValue.trim() === "" ? null : parseFloat(currentValue)
      const acquisitionPriceNum = acquisitionPrice.trim() === "" ? null : parseFloat(acquisitionPrice)
      const expectedPriceNum = expectedPrice.trim() === "" ? null : parseFloat(expectedPrice)
      const wishlistTargetId = effectiveIsWishlist ? wishlistTargetBoxId : null

      const requestBody = {
        ...(isNew ? {} : { id: item!.id }),
        name: name.trim(),
        description: description.trim() || null,
        current_value: currentValueNum && !Number.isNaN(currentValueNum) ? currentValueNum : null,
        acquisition_date: effectiveIsWishlist ? null : (acquisitionDate || null),
        acquisition_price: effectiveIsWishlist ? null : (acquisitionPriceNum != null && !Number.isNaN(acquisitionPriceNum) ? acquisitionPriceNum : null),
        expected_price: effectiveIsWishlist ? (expectedPriceNum && !Number.isNaN(expectedPriceNum) ? expectedPriceNum : null) : null,
        thumbnail_url: photos.find((p) => p.is_thumbnail)?.url ?? null,
        box_id: effectiveIsWishlist ? null : boxId,
        wishlist_target_box_id: wishlistTargetId,
        is_wishlist: effectiveIsWishlist,
        photos: photos.map((p) => ({
          url: p.url,
          storage_path: p.storage_path,
          is_thumbnail: p.is_thumbnail,
        })),
        tag_ids: selectedTagIds,
      }

      const response = await fetch("/api/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string }
        if (response.status === 403 && errorData.error === "item_limit_reached") {
          // Close first, then upsell — avoids dialog stacking / focus trap conflicts.
          onOpenChange(false)
          onCapReached?.()
          return
        }
        throw new Error(errorData.error || "Failed to save item")
      }

      // Clear unsaved uploads tracking since we successfully saved
      setUnsavedUploadedPhotos(new Set())
      unsavedUploadsRef.current = new Set()

      onSave()
      onOpenChange(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error)
      console.error("Error saving item:", message, error)
      Sentry.captureException(error, {
        tags: {
          area: "items",
          operation: "save_item",
        },
      })
      alert(`Failed to save item: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item || isNew) return

    const confirmed = window.confirm(
      `Are you sure you want to delete "${item.name}"? This action cannot be undone and will delete all associated photos.`
    )

    if (!confirmed) return

    setDeleting(true)

    try {
      const response = await fetch("/api/items/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: item.id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete item")
      }

      // Clear unsaved uploads tracking
      setUnsavedUploadedPhotos(new Set())
      unsavedUploadsRef.current = new Set()

      // Close dialog and refresh list
      onSave() // Refresh the list
      onOpenChange(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error)
      console.error("Error deleting item:", message, error)
      Sentry.captureException(error, {
        tags: {
          area: "items",
          operation: "delete_item",
        },
      })
      alert(`Failed to delete item: ${message}`)
    } finally {
      setDeleting(false)
    }
  }

  const openGallery = (index: number) => {
    setGalleryInitialIndex(index)
    setGalleryOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0"
          onInteractOutside={(e) => {
            if (galleryOpen || showImageSearch) e.preventDefault()
          }}
        >
          <DialogHeader className="min-w-0">
            <DialogTitle>{isNew ? (effectiveIsWishlist ? "Add to Wishlist" : "Add New Item") : "Edit Item"}</DialogTitle>
            <DialogDescription>
              {isNew
                ? (effectiveIsWishlist
                    ? "Add a wishlist item that can be linked to a box."
                    : "Add a new item to your collection.")
                : "Update item details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 layout-shrink-visible">
            {canSwitchNewItemMode && (
              <div className="justify-between items-center flex space-y-2">
                <Label>Item Type</Label>
                <div className="inline-flex rounded-md border bg-muted p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={newItemMode === "collection" ? "default" : "ghost"}
                    onClick={() => handleNewItemModeSwitch("collection")}
                  >
                    Collection Item
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={newItemMode === "wishlist" ? "default" : "ghost"}
                    onClick={() => handleNewItemModeSwitch("wishlist")}
                  >
                    Wishlist Item
                  </Button>
                </div>
              </div>
            )}
            <div className="min-w-0">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
              />
            </div>
            <div className="min-w-0">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Item description"
              />
            </div>
            {effectiveIsWishlist ? (
              <>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="layout-shrink-visible">
                    <Label>Current Value</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="layout-shrink-visible">
                    <Label>Expected Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={expectedPrice}
                      onChange={(e) => setExpectedPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label>Associated Collection Box</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-fluid-sm">
                      Selected: {wishlistTargetBoxName ?? (wishlistTargetBoxId ? "Selected box" : "None")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBoxPicker(true)}
                    >
                      Choose box
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="layout-shrink-visible">
                    <Label>Current Value</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="layout-shrink-visible">
                    <Label>Acquisition Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={acquisitionPrice}
                      onChange={(e) => setAcquisitionPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <Label>Acquisition Date</Label>
                  <Input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="min-w-0">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedTagIds.map((tagId) => {
                  const tag = userTags.find((t) => t.id === tagId)
                  if (!tag) return null
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-fluid-xs font-medium text-white"
                      style={getTagChipStyle(tag.color)}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))}
                        className="hover:opacity-80 rounded p-0.5"
                        aria-label={`Remove ${tag.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
                {!showCreateTag && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-fluid-xs"
                    onClick={() => setTagsDropdownOpen((o) => !o)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add tag
                  </Button>
                )}
              </div>
              {tagsDropdownOpen && !showCreateTag && (
                <div className="mt-2 p-2 border rounded-md bg-light-muted space-y-1 max-h-40 overflow-y-auto">
                  {userTags
                    .filter((t) => !selectedTagIds.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded text-fluid-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setSelectedTagIds((prev) => [...prev, t.id])
                          setTagsDropdownOpen(false)
                        }}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={getTagChipStyle(t.color)} />
                        {t.name}
                      </button>
                    ))}
                  {userTags.filter((t) => !selectedTagIds.includes(t.id)).length === 0 && (
                    <p className="text-fluid-xs text-muted-foreground px-2">No other tags. Create one below.</p>
                  )}
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 rounded text-fluid-sm hover:bg-muted font-medium border-t mt-1 pt-2"
                    onClick={() => {
                      setShowCreateTag(true)
                      setTagsDropdownOpen(false)
                    }}
                  >
                    + Create new tag
                  </button>
                </div>
              )}
              {showCreateTag && (
                <div className="mt-2 p-3 border rounded-md bg-light-muted space-y-2">
                  <div className="flex gap-2 flex-wrap items-end">
                    <div className="min-w-0 flex-1">
                      <Label className="text-fluid-xs">Tag name</Label>
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="New tag"
                        className="mt-0.5"
                      />
                    </div>
                    <div className="min-w-[120px]">
                      <Label className="text-fluid-xs">Color</Label>
                      <select
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value as TagColor)}
                        className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-fluid-sm"
                      >
                        {TAG_COLORS.map((c) => (
                          <option key={c} value={c}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        const name = newTagName.trim()
                        if (!name) return
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return
                        const { count } = await supabase.from("tags").select("id", { count: "exact", head: true }).eq("user_id", user.id)
                        if ((count ?? 0) >= MAX_TAGS_PER_USER) {
                          alert(`Maximum ${MAX_TAGS_PER_USER} tags. Delete or rename some in Settings > Tags.`)
                          return
                        }
                        const { data: newTag, error } = await supabase
                          .from("tags")
                          .insert({ user_id: user.id, name, color: newTagColor })
                          .select()
                          .single()
                        if (error) {
                          if (error.code === "23505") alert("A tag with this name already exists.")
                          else alert(error.message)
                          return
                        }
                        if (newTag) {
                          setUserTags((prev) => sortTagsByColorThenName([...prev, newTag]))
                          setSelectedTagIds((prev) => [...prev, newTag.id])
                          setNewTagName("")
                          setNewTagColor("blue")
                          setShowCreateTag(false)
                        }
                      }}
                    >
                      Create
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setShowCreateTag(false); setNewTagName(""); setNewTagColor("blue") }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="layout-shrink-visible">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Label>Images (up to {MAX_PHOTOS})</Label>
                {photos.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openGallery(0)}
                  >
                    <LayoutGrid className="h-4 w-4 mr-1" />
                    View gallery
                  </Button>
                )}
              </div>
              <p className="text-fluid-xs text-muted-foreground mb-2">
                Thumbnail is used on cards. Select one image as thumbnail; search and upload add images.
              </p>
              <div className="flex flex-wrap gap-3 mb-2">
                {photos.map((p, i) => (
                  <div
                    key={i}
                    className="relative w-24 h-24 rounded-lg border overflow-hidden bg-muted group"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="absolute inset-0 block w-full h-full cursor-pointer"
                      onClick={() => openGallery(i)}
                      onKeyDown={(e) => e.key === "Enter" && openGallery(i)}
                      aria-label="View full screen"
                    >
                      <ThumbnailImage
                        src={p.url}
                        alt={`Image ${i + 1}`}
                        className="object-cover"
                      />
                    </div>
                    <div
                      className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ThumbnailActionButtons
                        isThumbnail={p.is_thumbnail}
                        onSetThumbnail={() => setThumbnailIndex(i)}
                        onRemove={() => {
                          if (window.confirm("Remove this image?")) {
                            removePhoto(i)
                          }
                        }}
                      />
                    </div>
                    {p.is_thumbnail && (
                      <ThumbnailBadge className="absolute bottom-0 left-0 right-0 opacity-90 text-center py-0.5" />
                    )}
                  </div>
                ))}
              </div>
              {photos.length < MAX_PHOTOS && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Button type="button" variant="outline" onClick={() => setShowImageSearch(true)} className="shrink-0">
                    <SearchIcon className="h-4 w-4 mr-2" />
                    Search Images
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowUrlInput(true)} className="shrink-0">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Add Link
                  </Button>
                  <>
                    <input
                      id="item-dialog-upload-input"
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                      aria-label="Upload images"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="shrink-0"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Uploading…" : "Upload"}
                    </Button>
                  </>
                </div>
              )}
            </div>

            {!isNew && item && !effectiveIsWishlist && (
              <div className="border-t pt-4">
                <ValueGraph itemId={item.id} acquisitionDate={acquisitionDate.trim() || null} currentValue={currentValue} />
              </div>
            )}
          </div>
          <DialogFooter>
            {!isNew && item && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting || saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showImageSearch && (
        <ImageSearch
          open={showImageSearch}
          onOpenChange={setShowImageSearch}
          itemName={name}
          onSelectImage={(url) => {
            addPhoto(url, photos.length === 0)
            setShowImageSearch(false)
          }}
        />
      )}

      <BoxPickerDialog
        open={showBoxPicker}
        onOpenChange={setShowBoxPicker}
        initialBoxId={wishlistTargetBoxId}
        onConfirm={setWishlistTargetBoxId}
      />

      {showUrlInput && (
        <Dialog open={showUrlInput} onOpenChange={setShowUrlInput}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Image URL</DialogTitle>
              <DialogDescription>
                Paste or enter an image URL to add it to your item
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="url-input">Image URL</Label>
                <Input
                  id="url-input"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={urlInputValue}
                  onChange={(e) => setUrlInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddUrl()
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setUrlInputValue("")
                setShowUrlInput(false)
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddUrl}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ImageGalleryCarousel
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        images={photos.map((p) => ({ url: p.url, alt: name }))}
        initialIndex={galleryInitialIndex}
      />
    </>
  )
}
