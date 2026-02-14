"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search as SearchIcon, Loader2, ImageOff } from "lucide-react"
import Image from "next/image"

interface ImageSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onSelectImage: (url: string) => void
}

export default function ImageSearch({
  open,
  onOpenChange,
  itemName,
  onSelectImage,
}: ImageSearchProps) {
  const [searchQuery, setSearchQuery] = useState(itemName)
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())
  const selectedByPointerRef = useRef(false)

  const searchImages = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const res = await fetch(
        `/api/images/search?q=${encodeURIComponent(searchQuery.trim())}`
      )
      const data = await res.json()

      if (!res.ok) {
        alert(data.error ?? "Image search failed. Please try again.")
        setImages([])
        return
      }

      setImages(data.images ?? [])
      setFailedUrls(new Set())
    } catch (error) {
      console.error("Error searching images:", error)
      alert("Error searching images. Please try again.")
      setImages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && itemName) {
      setSearchQuery(itemName)
      searchImages()
    }
  }, [open, itemName])

  const handleImageError = useCallback((url: string) => {
    console.warn("[ImageSearch] Image failed to load:", url)
    setFailedUrls((prev) => new Set(prev).add(url))
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto min-w-0 z-[100]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle>Search for Images</DialogTitle>
          <DialogDescription>
            Search the web for images to use as a thumbnail for your item
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 min-w-0 overflow-hidden">
          <div className="flex flex-wrap gap-2 min-w-0">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchImages()}
              placeholder="Search for images..."
            />
            <Button onClick={searchImages} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          {loading && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            </div>
          )}
          {!loading && images.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {images.map((url, index) => (
                <div
                  key={`${index}-${url.slice(0, 40)}`}
                  role="button"
                  tabIndex={0}
                  className="relative aspect-square cursor-pointer hover:opacity-80 active:opacity-90 transition-opacity border rounded-lg overflow-hidden bg-muted touch-manipulation"
                  onClick={() => {
                    // Skip if we already handled via pointer down (avoids double-add on mobile).
                    if (selectedByPointerRef.current) {
                      selectedByPointerRef.current = false
                      return
                    }
                    if (!failedUrls.has(url)) onSelectImage(url)
                  }}
                  onPointerDown={(e) => {
                    // Handle selection on pointer down so it works on mobile before
                    // any "interact outside" logic can close the dialog.
                    if (failedUrls.has(url)) return
                    e.preventDefault()
                    e.stopPropagation()
                    selectedByPointerRef.current = true
                    onSelectImage(url)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      if (!failedUrls.has(url)) onSelectImage(url)
                    }
                  }}
                >
                  {failedUrls.has(url) ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground text-fluid-sm">
                      <ImageOff className="h-8 w-8" />
                      <span>Failed to load</span>
                    </div>
                  ) : (
                    <Image
                      src={url}
                      alt={`Search result ${index + 1}`}
                      fill
                      className="object-cover pointer-events-none"
                      unoptimized
                      onError={() => handleImageError(url)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {!loading && images.length === 0 && searchQuery && (
            <div className="text-center py-8 text-fluid-sm text-muted-foreground min-w-0">
              No images found. Try a different search term.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
