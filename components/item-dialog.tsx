"use client"

import { useState, useEffect } from "react"
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
  const [showImageSearch, setShowImageSearch] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0)

  useEffect(() => {
    if (item && !isNew) {
      setName(item.name || "")
      setDescription(item.description || "")
      setCurrentValue(item.current_value?.toString() || "")
      setAcquisitionDate(item.acquisition_date || "")
      setAcquisitionPrice(item.acquisition_price?.toString() || "")
      setExpectedPrice(item.expected_price?.toString() || "")
      setPhotos(toLocalPhotos(item))
    } else {
      setName("")
      setDescription("")
      setCurrentValue("")
      setAcquisitionDate(isWishlist ? "" : new Date().toISOString().split("T")[0])
      setAcquisitionPrice("")
      setExpectedPrice("")
      setPhotos([])
    }
  }, [item, isNew, open, isWishlist])

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

  const removePhoto = (index: number) => {
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

    setUploading(true)
    const urls: string[] = []
    for (let i = 0; i < toAdd; i++) {
      const file = files[i]
      if (file.size > 4 * 1024 * 1024) {
        alert(`"${file.name}" is larger than 4MB and was skipped.`)
        continue
      }
      const fileExt = file.name.split(".").pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `items/${fileName}`
      const { error } = await supabase.storage.from("item-photos").upload(filePath, file)
      if (error) {
        console.error("Upload error:", error)
        continue
      }
      const { data } = supabase.storage.from("item-photos").getPublicUrl(filePath)
      urls.push(data.publicUrl)
    }
    setPhotos((prev) => {
      const next = [...prev]
      const needThumb = next.length === 0
      urls.forEach((url, i) => {
        if (next.length >= MAX_PHOTOS) return
        next.push({ url, is_thumbnail: needThumb && i === 0 })
      })
      return next
    })
    setUploading(false)
    e.target.value = ""
  }

  const handleSave = async () => {
    if (!name.trim()) return

    setSaving(true)
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) return

    const thumbnailUrl = photos.find((p) => p.is_thumbnail)?.url ?? null

    const itemData: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      current_value: currentValue ? parseFloat(currentValue) : null,
      acquisition_date: isWishlist ? null : (acquisitionDate || null),
      acquisition_price: isWishlist ? null : (acquisitionPrice ? parseFloat(acquisitionPrice) : null),
      expected_price: isWishlist ? (expectedPrice ? parseFloat(expectedPrice) : null) : null,
      thumbnail_url: thumbnailUrl,
      box_id: isWishlist ? null : boxId,
      user_id: userId,
      is_wishlist: isWishlist,
    }

    try {
      let itemId: string
      if (isNew) {
        const { data: newItem, error } = await supabase.from("items").insert(itemData).select("id").single()
        if (error) throw error
        itemId = newItem.id
      } else {
        itemId = item!.id
        const { error } = await supabase.from("items").update(itemData).eq("id", itemId)
        if (error) throw error
      }

      // Sync photos table: replace all photos for this item
      const { error: deleteError } = await supabase.from("photos").delete().eq("item_id", itemId)
      if (deleteError) throw deleteError
      if (photos.length) {
        const { error: insertError } = await supabase.from("photos").insert(
          photos.map((p) => ({
            item_id: itemId,
            url: p.url,
            is_thumbnail: p.is_thumbnail,
          }))
        )
        if (insertError) throw insertError
      }

      // Value history: record when value changed (edit) or set (new item)
      const newValRaw = currentValue.trim() === "" ? null : parseFloat(currentValue)
      const newVal = newValRaw === null || Number.isNaN(newValRaw) ? null : newValRaw
      if (isNew) {
        if (newVal != null) {
          await supabase.from("value_history").insert({ item_id: itemId, value: newVal })
        }
      } else {
        const { data: latestRecord } = await supabase
          .from("value_history")
          .select("value")
          .eq("item_id", itemId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const latestValue = latestRecord?.value != null ? Number(latestRecord.value) : null
        const valueDiffersFromLatest =
          (latestValue === null) !== (newVal === null) ||
          (latestValue !== null && newVal !== null && Math.abs(latestValue - newVal) >= 1e-6)
        if (valueDiffersFromLatest) {
          await supabase.from("value_history").insert({
            item_id: itemId,
            value: newVal ?? 0,
          })
        }
      }

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
    } finally {
      setSaving(false)
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
          <div className="space-y-4 py-4 min-w-0 overflow-hidden">
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
                  <div className="min-w-0 overflow-hidden">
                    <label className="text-fluid-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="min-w-0 overflow-hidden">
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
                  <div className="min-w-0 overflow-hidden">
                    <label className="text-fluid-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="min-w-0 overflow-hidden">
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
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm("Remove this image?")) removePhoto(i)
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
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
