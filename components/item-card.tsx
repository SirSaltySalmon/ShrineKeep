"use client"

import { Item, type TagColor } from "@/lib/types"
import { cn, getTagChipStyle, formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Selectable, CARD_HOVER_MOTION_CLASS } from "@/components/selectable"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, Check } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"

const VALUE_COLOR_STYLE = { color: "hsl(var(--value-color))" } as const
const ACQUISITION_COLOR_STYLE = { color: "hsl(var(--acquisition-color))" } as const


interface ItemCardProps {
  item: Item
  variant: "collection" | "wishlist"
  /** When true, show selection ring (focus ring). */
  selected?: boolean
  /** When true, show lighter ring on hover (selection mode). */
  selectionMode?: boolean
  onClick: (item: Item, e: React.MouseEvent) => void
  onMarkAcquired?: (item: Item) => void
  /** Shared / public view: no click affordance, dialog, or mark-acquired. */
  readOnly?: boolean
}

export default function ItemCard({
  item,
  variant,
  selected = false,
  selectionMode = false,
  onClick,
  onMarkAcquired,
  readOnly = false,
}: ItemCardProps) {
  const itemMinHeightClass =
    variant === "collection"
      ? "min-h-[424px]"
      : "min-h-[450px]"
  const isCollection = variant === "collection"
  const secondaryPrice = isCollection ? item.acquisition_price : item.expected_price
  const secondaryLabel = isCollection ? "Acquired for" : "Expected"

  const card = (
      <Card className={itemMinHeightClass}>
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
        <CardTitle className="text-fluid-lg">{item.name}</CardTitle>
        {item.description && (
          <CardDescription className="line-clamp-2">
            {item.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1 text-fluid-sm layout-shrink-visible">
          {item.current_value !== null && item.current_value !== undefined && (
            <div className="font-medium truncate" style={VALUE_COLOR_STYLE}>
              Value: {formatCurrency(item.current_value)}
            </div>
          )}
          {secondaryPrice !== null && secondaryPrice !== undefined && (
            <div className="truncate" style={ACQUISITION_COLOR_STYLE}>
              {secondaryLabel}: {formatCurrency(secondaryPrice)}
            </div>
          )}
          {isCollection && item.acquisition_date && (
            <div className="text-muted-foreground text-fluid-xs truncate">
              {formatDate(item.acquisition_date)}
            </div>
          )}
        </div>
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
        {!isCollection && onMarkAcquired && (
          <Button
            size="sm"
            className="w-full mt-3"
            onClick={(e) => {
              e.stopPropagation()
              onMarkAcquired(item)
            }}
          >
            <Check className="h-4 w-4 mr-2" />
            Mark as Acquired
          </Button>
        )}
      </CardContent>
    </Card>
  )

  if (readOnly) {
    return (
      <div className={cn(CARD_HOVER_MOTION_CLASS, "cursor-default")}>{card}</div>
    )
  }

  return (
    <Selectable
      selected={selected}
      selectionMode={selectionMode}
      className="item-card-no-select"
      onClick={(e) => onClick(item, e)}
    >
      {card}
    </Selectable>
  )
}
