"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import ImageGalleryCarousel from "@/components/image-gallery-carousel"
import ThumbnailImage from "@/components/thumbnail-image"
import type { PresentedItem, PresentedItemDetail } from "@/lib/sharing/presentation/models"
import { cn, FOCUS_RING_CLASS, formatCurrency, formatDate } from "@/lib/utils"

const VALUE_COLOR_STYLE = { color: "hsl(var(--value-color))" } as const
const ACQUISITION_COLOR_STYLE = { color: "hsl(var(--acquisition-color))" } as const

export function PublicItemDetailDialog({
  open,
  onOpenChange,
  detail,
  variant,
  loadingMore,
  onLoadMorePhotos,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: PresentedItemDetail | null
  variant: "collection" | "wishlist"
  loadingMore: boolean
  onLoadMorePhotos?: () => void
}) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const item = detail?.item
  const photos = detail?.photos ?? []
  const photo = photos[photoIndex] ?? photos[0]
  const secondaryPrice = variant === "collection" ? item?.acquisitionPrice : item?.expectedPrice
  const secondaryLabel = variant === "collection" ? "Acquired for" : "Expected"

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setPhotoIndex(0)
            setGalleryOpen(false)
          }
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{item?.name ?? "Item"}</DialogTitle>
            {item?.description ? <DialogDescription>{item.description}</DialogDescription> : null}
          </DialogHeader>
          {photo ? (
            <button
              type="button"
              className={cn(
                "block w-full cursor-pointer overflow-hidden rounded-md bg-muted",
                FOCUS_RING_CLASS,
              )}
              onClick={() => setGalleryOpen(true)}
              aria-label="View full picture"
            >
              <ThumbnailImage
                src={photo.url}
                alt={photo.alt}
                fill={false}
                className="mx-auto max-h-[min(24rem,70vh)] w-full object-contain"
              />
            </button>
          ) : null}
          {photos.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {photos.map((entry, index) => (
                <Button
                  key={`${entry.url}-${index}`}
                  type="button"
                  size="sm"
                  variant={index === photoIndex ? "default" : "outline"}
                  onClick={() => setPhotoIndex(index)}
                >
                  {index + 1}
                </Button>
              ))}
              {onLoadMorePhotos ? (
                <Button type="button" size="sm" variant="secondary" disabled={loadingMore} onClick={onLoadMorePhotos}>
                  {loadingMore ? "Loading…" : "More photos"}
                </Button>
              ) : null}
            </div>
          ) : onLoadMorePhotos ? (
            <Button type="button" size="sm" variant="secondary" disabled={loadingMore} onClick={onLoadMorePhotos}>
              {loadingMore ? "Loading…" : "More photos"}
            </Button>
          ) : null}
          {item ? <PublicItemFields item={item} secondaryLabel={secondaryLabel} secondaryPrice={secondaryPrice ?? null} /> : null}
        </DialogContent>
      </Dialog>
      {photos.length > 0 ? (
        <ImageGalleryCarousel
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          images={photos}
          initialIndex={photoIndex}
        />
      ) : null}
    </>
  )
}

function PublicItemFields({
  item,
  secondaryLabel,
  secondaryPrice,
}: {
  item: PresentedItem
  secondaryLabel: string
  secondaryPrice: number | null
}) {
  return (
    <div className="space-y-1 text-fluid-sm">
      {item.currentValue !== null ? (
        <p className="font-medium" style={VALUE_COLOR_STYLE}>Value: {formatCurrency(item.currentValue)}</p>
      ) : null}
      {secondaryPrice !== null ? (
        <p style={ACQUISITION_COLOR_STYLE}>{secondaryLabel}: {formatCurrency(secondaryPrice)}</p>
      ) : null}
      {item.acquisitionDate ? (
        <p className="text-muted-foreground text-fluid-xs">{formatDate(item.acquisitionDate)}</p>
      ) : null}
      {item.visibleTargetName ? (
        <p className="text-muted-foreground text-fluid-xs">For {item.visibleTargetName}</p>
      ) : null}
    </div>
  )
}

