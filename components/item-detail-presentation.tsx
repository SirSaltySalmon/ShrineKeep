"use client"

import { formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import ThumbnailImage from "./thumbnail-image"
import ImageGalleryCarousel from "./image-gallery-carousel"
import { Image as ImageIcon } from "lucide-react"
import { useState } from "react"
import type { CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import { hasOwnerMutation } from "@/lib/sharing/presentation/capabilities"
import { assertPublicCapabilities } from "@/lib/sharing/presentation/capabilities"
import type { PresentedItemDetail } from "@/lib/sharing/presentation/models"

const VALUE_COLOR_STYLE = { color: "hsl(var(--value-color))" } as const
const ACQUISITION_COLOR_STYLE = { color: "hsl(var(--acquisition-color))" } as const

interface ItemDetailPresentationProps {
  detail: PresentedItemDetail
  variant: "collection" | "wishlist"
  capabilities: CollectionCapabilities
}

export default function ItemDetailPresentation({
  detail,
  variant,
  capabilities,
}: ItemDetailPresentationProps) {
  if (!hasOwnerMutation(capabilities)) assertPublicCapabilities(capabilities)
  const { item, photos } = detail
  const [galleryOpen, setGalleryOpen] = useState(false)
  const showTags = capabilities.showTags && item.tags.length > 0
  const isCollection = variant === "collection"
  const secondaryPrice = isCollection ? item.acquisitionPrice : item.expectedPrice
  const secondaryLabel = isCollection ? "Acquired for" : "Expected"

  return (
    <Card>
      <div className="relative w-full h-56 bg-muted rounded-t-lg overflow-hidden">
        {item.thumbnailUrl ? (
          <button type="button" className="h-full w-full" onClick={() => photos.length > 0 && setGalleryOpen(true)}>
            <ThumbnailImage src={item.thumbnailUrl} alt={item.name} className="object-cover" />
          </button>
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardHeader>
        <CardTitle className="text-fluid-lg">{item.name}</CardTitle>
        {item.description ? (
          <CardDescription>{item.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 text-fluid-sm">
        {item.currentValue !== null && (
          <div className="font-medium" style={VALUE_COLOR_STYLE}>
            Value: {formatCurrency(item.currentValue)}
          </div>
        )}
        {secondaryPrice !== null && (
          <div style={ACQUISITION_COLOR_STYLE}>
            {secondaryLabel}: {formatCurrency(secondaryPrice)}
          </div>
        )}
        {isCollection && item.acquisitionDate ? (
          <div className="text-muted-foreground text-fluid-xs">{formatDate(item.acquisitionDate)}</div>
        ) : null}
        {!isCollection && item.visibleTargetName ? (
          <div className="text-muted-foreground text-fluid-xs">For {item.visibleTargetName}</div>
        ) : null}
        {showTags ? (
          <p className="text-muted-foreground text-fluid-xs">{item.tags.map(tag => tag.name).join(", ")}</p>
        ) : null}
      </CardContent>
      {photos.length > 0 ? (
        <ImageGalleryCarousel
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          images={photos}
        />
      ) : null}
    </Card>
  )
}
