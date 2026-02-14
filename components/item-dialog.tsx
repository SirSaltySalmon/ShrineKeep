"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item, Photo } from "@/lib/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Search as SearchIcon, Trash2, Star, LayoutGrid } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"
import ImageSearch from "./image-search"
import ImageGalleryCarousel from "./image-gallery-carousel"
import ValueGraph from "./value-graph"

const MAX_PHOTOS = 10

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
  isWishlist?: boolean
}

export default function ItemDialog({
  open,
  onOpenChange,
  item,
  isNew,
  boxId,
  onSave,
  isWishlist = false,
}: ItemDialogProps) {
  const supabase = createSupabaseClient()
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
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0)
  // Track photos uploaded during this session that haven't been saved yet
  const [unsavedUploadedPhotos, setUnsavedUploadedPhotos] = useState<Set<string>>(new Set())
  // Use ref to track unsaved uploads for cleanup (avoids stale closure issues)
  const unsavedUploadsRef = useRef<Set<string>>(new Set())

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
    }
  }, [])

  useEffect(() => {
    if (item && !isNew) {
      setName(item.name || "")
      setDescription(item.description || "")
      setCurrentValue(item.current_value?.toString() || "")
      setAcquisitionDate(item.acquisition_date || "")
      setAcquisitionPrice(item.acquisition_price?.toString() || "")
      setExpectedPrice(item.expected_price?.toString() || "")
      setPhotos(toLocalPhotos(item))
      setUnsavedUploadedPhotos(new Set()) // Clear unsaved uploads when loading existing item
      unsavedUploadsRef.current = new Set()
    } else {
      setName("")
      setDescription("")
      setCurrentValue("")
      setAcquisitionDate(isWishlist ? "" : new Date().toISOString().split("T")[0])
      setAcquisitionPrice("")
      setExpectedPrice("")
      setPhotos([])
      setUnsavedUploadedPhotos(new Set()) // Clear unsaved uploads for new items
      unsavedUploadsRef.current = new Set()
    }
  }, [item, isNew, open, isWishlist])

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
        alert(`Failed to upload "${file.name}": ${error.message}`)
        continue
      }
      
      // For wishlist items, use public URL (accessible via storage policy)
      // For private items, use signed URL (valid for 1 year)
      let url: string
      if (isWishlist) {
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

      const requestBody = {
        ...(isNew ? {} : { id: item!.id }),
        name: name.trim(),
        description: description.trim() || null,
        current_value: currentValueNum && !Number.isNaN(currentValueNum) ? currentValueNum : null,
        acquisition_date: isWishlist ? null : (acquisitionDate || null),
        acquisition_price: isWishlist ? null : (acquisitionPriceNum && !Number.isNaN(acquisitionPriceNum) ? acquisitionPriceNum : null),
        expected_price: isWishlist ? (expectedPriceNum && !Number.isNaN(expectedPriceNum) ? expectedPriceNum : null) : null,
        thumbnail_url: photos.find((p) => p.is_thumbnail)?.url ?? null,
        box_id: isWishlist ? null : boxId,
        is_wishlist: isWishlist,
        photos: photos.map((p) => ({
          url: p.url,
          storage_path: p.storage_path,
          is_thumbnail: p.is_thumbnail,
        })),
      }

      const response = await fetch("/api/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
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
            if (galleryOpen) e.preventDefault()
          }}
        >
          <DialogHeader className="min-w-0">
            <DialogTitle>{isNew ? (isWishlist ? "Add to Wishlist" : "Add New Item") : "Edit Item"}</DialogTitle>
            <DialogDescription>
              {isNew ? "Add a new item to your collection" : "Update item details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0 overflow-visible">
            <div className="min-w-0">
              <label className="text-fluid-sm font-medium">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
              />
            </div>
            <div className="min-w-0">
              <label className="text-fluid-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Item description"
              />
            </div>
            {isWishlist ? (
              <>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="min-w-0 overflow-visible">
                    <label className="text-fluid-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="min-w-0 overflow-visible">
                    <label className="text-fluid-sm font-medium">Expected Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={expectedPrice}
                      onChange={(e) => setExpectedPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="min-w-0 overflow-visible">
                    <label className="text-fluid-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="min-w-0 overflow-visible">
                    <label className="text-fluid-sm font-medium">Acquisition Price</label>
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
                  <label className="text-fluid-sm font-medium">Acquisition Date</label>
                  <Input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-fluid-sm font-medium">Images (up to {MAX_PHOTOS})</label>
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
                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          setThumbnailIndex(i)
                        }}
                        title="Set as thumbnail"
                        aria-label="Set as thumbnail"
                      >
                        <Star className={`h-4 w-4 ${p.is_thumbnail ? "fill-amber-400" : ""}`} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-red-500/80"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (window.confirm("Remove this image?")) {
                            await removePhoto(i)
                          }
                        }}
                        title="Remove image"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {p.is_thumbnail && (
                      <span className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-fluid-xs text-center text-white py-0.5">
                        Thumbnail
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {photos.length < MAX_PHOTOS && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowImageSearch(true)}>
                    <SearchIcon className="h-4 w-4 mr-2" />
                    Search Images
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <label>
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </Button>
                </div>
              )}
            </div>

            {!isNew && item && !isWishlist && (
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

      <ImageGalleryCarousel
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        images={photos.map((p) => ({ url: p.url, alt: name }))}
        initialIndex={galleryInitialIndex}
      />
    </>
  )
}
