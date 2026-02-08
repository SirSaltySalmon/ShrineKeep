"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"
import { Upload, Search as SearchIcon, TrendingUp } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"
import ImageSearch from "./image-search"
import ValueGraph from "./value-graph"

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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showImageSearch, setShowImageSearch] = useState(false)

  useEffect(() => {
    if (item && !isNew) {
      setName(item.name || "")
      setDescription(item.description || "")
      setCurrentValue(item.current_value?.toString() || "")
      setAcquisitionDate(item.acquisition_date || "")
      setAcquisitionPrice(item.acquisition_price?.toString() || "")
      setExpectedPrice(item.expected_price?.toString() || "")
      setThumbnailUrl(item.thumbnail_url || null)
    } else {
      setName("")
      setDescription("")
      setCurrentValue("")
      setAcquisitionDate(isWishlist ? "" : new Date().toISOString().split("T")[0])
      setAcquisitionPrice("")
      setExpectedPrice("")
      setThumbnailUrl(null)
    }
  }, [item, isNew, open, isWishlist])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 4 * 1024 * 1024) {
      alert("File size must be less than 4MB")
      return
    }

    setUploading(true)
    const fileExt = file.name.split(".").pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `items/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("item-photos")
      .upload(filePath, file)

    if (uploadError) {
      console.error("Upload error:", uploadError)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from("item-photos").getPublicUrl(filePath)
    setThumbnailUrl(data.publicUrl)
    setUploading(false)
  }

  const handleSave = async () => {
    if (!name.trim()) return

    setSaving(true)
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) return

    const itemData: any = {
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
      if (isNew) {
        const { error } = await supabase.from("items").insert(itemData)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("items")
          .update(itemData)
          .eq("id", item!.id)
        if (error) throw error

        // Record value change only when the new value differs from the latest record (not previous item value)
        const newValRaw = currentValue.trim() === "" ? null : parseFloat(currentValue)
        const newVal = newValRaw === null || Number.isNaN(newValRaw) ? null : newValRaw
        const { data: latestRecord } = await supabase
          .from("value_history")
          .select("value")
          .eq("item_id", item!.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const latestValue =
          latestRecord?.value != null ? Number(latestRecord.value) : null
        const valueDiffersFromLatest =
          (latestValue === null) !== (newVal === null) ||
          (latestValue !== null && newVal !== null && Math.abs(latestValue - newVal) >= 1e-6)
        if (item && valueDiffersFromLatest) {
          await supabase.from("value_history").insert({
            item_id: item.id,
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? (isWishlist ? "Add to Wishlist" : "Add New Item") : "Edit Item"}</DialogTitle>
            <DialogDescription>
              {isNew
                ? "Add a new item to your collection"
                : "Update item details"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Item description"
              />
            </div>
            {isWishlist ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Expected Price</label>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Current Value</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Acquisition Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={acquisitionPrice}
                      onChange={(e) => setAcquisitionPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Acquisition Date</label>
                  <Input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">Thumbnail</label>
              <div className="mt-2 space-y-2">
                {thumbnailUrl && (
                  <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                    <ThumbnailImage
                      src={thumbnailUrl}
                      alt="Thumbnail"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowImageSearch(true)}
                  >
                    <SearchIcon className="h-4 w-4 mr-2" />
                    Search Images
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <label>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </Button>
                </div>
              </div>
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
            setThumbnailUrl(url)
            setShowImageSearch(false)
          }}
        />
      )}
    </>
  )
}
