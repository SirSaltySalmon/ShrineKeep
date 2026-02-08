"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search as SearchIcon, Loader2 } from "lucide-react"
import Image from "next/image"

interface GoogleImageSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onSelectImage: (url: string) => void
}

export default function GoogleImageSearch({
  open,
  onOpenChange,
  itemName,
  onSelectImage,
}: GoogleImageSearchProps) {
  const [searchQuery, setSearchQuery] = useState(itemName)
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const searchImages = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY
      const engineId = process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID

      if (!apiKey || !engineId) {
        alert("Google Search API not configured. Please set up your API keys.")
        return
      }

      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(searchQuery)}&searchType=image&num=10`
      )

      const data = await response.json()
      if (data.items) {
        setImages(data.items.map((item: any) => item.link))
      } else {
        setImages([])
      }
    } catch (error) {
      console.error("Error searching images:", error)
      alert("Error searching images. Please try again.")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search for Images</DialogTitle>
          <DialogDescription>
            Search Google Images to find a thumbnail for your item
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex space-x-2">
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
                  key={index}
                  className="relative aspect-square cursor-pointer hover:opacity-80 transition-opacity border rounded-lg overflow-hidden"
                  onClick={() => onSelectImage(url)}
                >
                  <Image
                    src={url}
                    alt={`Search result ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
          {!loading && images.length === 0 && searchQuery && (
            <div className="text-center py-8 text-muted-foreground">
              No images found. Try a different search term.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
