"use client"

import { Item, type TagColor } from "@/lib/types"
import { getTagChipStyle, formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, Check } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"

// Get colors from CSS variables
function getValueColor(): string {
  if (typeof window === "undefined") return "hsl(142 76% 36%)"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--value-color").trim()
  return value ? `hsl(${value})` : "hsl(142 76% 36%)"
}

function getAcquisitionColor(): string {
  if (typeof window === "undefined") return "hsl(0 84% 60%)"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--acquisition-color").trim()
  return value ? `hsl(${value})` : "hsl(0 84% 60%)"
}


interface ItemCardProps {
  item: Item
  variant: "collection" | "wishlist"
  /** When true, show selection highlight (theme color). */
  selected?: boolean
  onClick: (item: Item, e: React.MouseEvent) => void
  onMarkAcquired?: (item: Item) => void
}

export default function ItemCard({
  item,
  variant,
  selected = false,
  onClick,
  onMarkAcquired,
}: ItemCardProps) {
  return (
    <Card
      className={`item-card-no-select cursor-pointer hover:shadow-lg transition-shadow ${selected ? "ring-2 ring-itemSelected" : ""}`}
      onClick={(e) => onClick(item, e)}
    >
      <div className="relative w-full h-48 bg-muted rounded-t-lg overflow-hidden">
        {item.thumbnail_url ? (
          <ThumbnailImage
            src={item.thumbnail_url}
            alt={item.name}
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardHeader>
        <CardTitle className="text-fluid-lg line-clamp-1 truncate">{item.name}</CardTitle>
        {item.description && (
          <CardDescription className={variant === "collection" ? "line-clamp-2" : ""}>
            {item.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent onClick={(e) => e.stopPropagation()}>
        {variant === "collection" ? (
          <div className="space-y-1 text-fluid-sm min-w-0 overflow-visible">
            {item.current_value !== null && item.current_value !== undefined && (
              <div className="font-medium truncate" style={{ color: getValueColor() }}>
                Value: {formatCurrency(item.current_value)}
              </div>
            )}
            {item.acquisition_price !== null && item.acquisition_price !== undefined && (
              <div className="truncate" style={{ color: getAcquisitionColor() }}>
                Acquired: {formatCurrency(item.acquisition_price)}
              </div>
            )}
            {item.acquisition_date && (
              <div className="text-muted-foreground text-fluid-xs truncate">
                {formatDate(item.acquisition_date)}
              </div>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-md px-1.5 py-0.5 text-fluid-xs font-medium text-white"
                    style={getTagChipStyle(tag.color ?? "blue")}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-fluid-sm min-w-0 overflow-visible">
            {item.expected_price !== null && item.expected_price !== undefined && (
              <div className="font-medium truncate">
                Expected: {formatCurrency(item.expected_price)}
              </div>
            )}
            {onMarkAcquired && (
              <Button
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAcquired(item)
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                Mark as Acquired
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
