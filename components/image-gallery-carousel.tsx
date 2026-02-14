"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import ThumbnailImage from "./thumbnail-image"

export interface GalleryImage {
  url: string
  alt?: string
}

interface ImageGalleryCarouselProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  images: GalleryImage[]
  /** 0-based index to start at */
  initialIndex?: number
}

const MAX_IMAGES = 10

export default function ImageGalleryCarousel({
  open,
  onOpenChange,
  images,
  initialIndex = 0,
}: ImageGalleryCarouselProps) {
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1))
  )

  useEffect(() => {
    if (open && images.length) {
      const i = Math.min(Math.max(0, initialIndex), images.length - 1)
      setIndex(i)
    }
  }, [open, images.length, initialIndex])

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? images.length - 1 : i - 1))
  }, [images.length])

  const goNext = useCallback(() => {
    setIndex((i) => (i >= images.length - 1 ? 0 : i + 1))
  }, [images.length])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onOpenChange(false)
        return
      }
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [open, onOpenChange, goPrev, goNext])

  if (!open || typeof document === "undefined") return null

  const current = images[index]
  const hasMultiple = images.length > 1

  const isGalleryControl = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest("[data-gallery-control]") !== null

  const blockNonControlInteraction = (e: React.PointerEvent | React.MouseEvent) => {
    if (isGalleryControl(e.target)) return
    e.preventDefault()
    e.stopPropagation()
  }

  const content = (
    <div
      className="fixed inset-0 flex flex-col bg-black/95 pointer-events-auto"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
      onPointerDownCapture={blockNonControlInteraction}
      onPointerUpCapture={blockNonControlInteraction}
      onClickCapture={blockNonControlInteraction}
      onMouseDownCapture={blockNonControlInteraction}
      onMouseUpCapture={blockNonControlInteraction}
    >
      <div className="absolute right-2 top-2 z-20 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative z-20 h-10 w-10 rounded-full text-white hover:bg-white/20 pointer-events-auto"
          onClick={() => onOpenChange(false)}
          aria-label="Close gallery"
          data-gallery-control
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="relative flex flex-1 min-h-0 items-center justify-center p-4">
        {hasMultiple && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 h-12 w-12 shrink-0 rounded-full text-white hover:bg-white/20 pointer-events-auto"
            onClick={goPrev}
            data-gallery-control
            aria-label="Previous image"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}

        <div className="relative z-0 w-full max-w-5xl aspect-square max-h-[85vh] flex items-center justify-center pointer-events-none">
          {current && (
            <div className="relative w-full h-full min-h-[300px]">
              <ThumbnailImage
                src={current.url}
                alt={current.alt ?? `Image ${index + 1}`}
                className="object-contain"
              />
            </div>
          )}
        </div>

        {hasMultiple && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 h-12 w-12 shrink-0 rounded-full text-white hover:bg-white/20 pointer-events-auto"
            onClick={goNext}
            aria-label="Next image"
            data-gallery-control
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}
      </div>

        {hasMultiple && (
          <div className="flex justify-center gap-1.5 pb-6 pt-2 shrink-0 pointer-events-auto" data-gallery-control>
            {images.slice(0, MAX_IMAGES).map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/70"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
