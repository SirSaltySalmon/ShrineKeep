"use client"

import { cn, getTagChipStyle, formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Selectable, CARD_HOVER_MOTION_CLASS } from "@/components/selectable"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, Check } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"
import type { CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import type { PresentedItem } from "@/lib/sharing/presentation/models"
import { getPlaceholderTint } from "@/lib/placeholder-tint"
import { DEFAULT_CARD_DENSITY, getItemCardMinHeightClass, type CardDensity } from "@/lib/card-density"
import { CardStatLine } from "./card-stat-line"
import type { DraggableAttributes } from "@dnd-kit/core"

const VALUE_COLOR_STYLE = { color: "hsl(var(--value-color))" } as const
const ACQUISITION_COLOR_STYLE = { color: "hsl(var(--acquisition-color))" } as const

interface ItemCardProps {
  item: PresentedItem
  variant: "collection" | "wishlist"
  capabilities: CollectionCapabilities
  selected?: boolean
  selectionMode?: boolean
  /**
   * `useDraggable().attributes` when the card sits inside a drag handle. They go on the card,
   * which is the focusable element, and it shows a grab cursor instead of the pointer.
   */
  dragAttributes?: DraggableAttributes
  /** Card density for this device (`useCardDensity()` in the grid). Comfortable is the original layout. */
  density?: CardDensity
  onClick?: (item: PresentedItem, e: React.MouseEvent) => void
  onMarkAcquired?: (item: PresentedItem) => void
}

export default function ItemCard({
  item,
  variant,
  capabilities,
  selected = false,
  selectionMode = false,
  dragAttributes,
  density = DEFAULT_CARD_DENSITY,
  onClick,
  onMarkAcquired,
}: ItemCardProps) {
  // Compact: half-height thumbnail, tighter padding, no description. Same content otherwise.
  const compact = density === "compact"
  const itemMinHeightClass = getItemCardMinHeightClass(density, variant)
  const isCollection = variant === "collection"
  const thumbnailSource = item.thumbnailUrl
  const secondaryPrice = isCollection ? item.acquisitionPrice : item.expectedPrice
  // Compact cards can be half as wide; the shorter label is the one box cards already use.
  const secondaryLabel = isCollection ? (compact ? "Acquired" : "Acquired for") : "Expected"
  const interactive = Boolean(onClick) && (capabilities.canEdit || capabilities.canSelect || capabilities.canOpenDetail)
  const showAcquire = !isCollection && capabilities.canAcquire && onMarkAcquired
  const showTags = capabilities.showTags && item.tags.length > 0
  // No photo: wash the tile in the item's first tag colour. Follows showTags so a
  // surface that hides tags never reveals one through the tint.
  const placeholderTint = !thumbnailSource && showTags ? getPlaceholderTint(item.tags) : null

  const card = (
    <Card className={itemMinHeightClass}>
      <div
        className={cn(
          "relative w-full rounded-t-lg overflow-hidden",
          compact ? "h-24" : "h-48",
          !placeholderTint && "bg-muted"
        )}
        style={placeholderTint ? { backgroundColor: placeholderTint.background } : undefined}
      >
        {thumbnailSource ? (
          <ThumbnailImage
            src={thumbnailSource}
            alt={item.name}
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon
              className={cn(compact ? "h-8 w-8" : "h-12 w-12", !placeholderTint && "text-muted-foreground")}
              style={placeholderTint ? { color: placeholderTint.color } : undefined}
            />
          </div>
        )}
      </div>
      <CardHeader className={compact ? "p-3 pb-1.5" : undefined}>
        <CardTitle
          className={compact ? "text-fluid-base" : "text-fluid-lg"}
          title={compact ? item.name : undefined}
        >
          {item.name}
        </CardTitle>
        {item.description && !compact && (
          <CardDescription className="line-clamp-2">
            {item.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className={compact ? "p-3 pt-0" : undefined} onClick={(e) => e.stopPropagation()}>
        <div className={cn("text-fluid-sm layout-shrink-visible", compact ? "leading-snug" : "space-y-1")}>
          {item.currentValue !== null && item.currentValue !== undefined && (
            <CardStatLine
              label="Value"
              value={formatCurrency(item.currentValue)}
              density={density}
              className="font-medium"
              style={VALUE_COLOR_STYLE}
            />
          )}
          {secondaryPrice !== null && secondaryPrice !== undefined && (
            <CardStatLine
              label={secondaryLabel}
              value={formatCurrency(secondaryPrice)}
              density={density}
              style={ACQUISITION_COLOR_STYLE}
            />
          )}
          {isCollection && item.acquisitionDate && (
            <div className="text-muted-foreground text-fluid-xs truncate">
              {formatDate(item.acquisitionDate)}
            </div>
          )}
          {!isCollection && item.visibleTargetName && (
            <div className="text-muted-foreground text-fluid-xs truncate">
              For {item.visibleTargetName}
            </div>
          )}
        </div>
        {showTags && (
          <div className={cn("flex flex-wrap gap-1", compact ? "mt-1.5" : "mt-1")}>
            {item.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-md px-1.5 py-0.5 text-fluid-xs font-medium"
                style={getTagChipStyle(tag.color ?? "blue")}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {showAcquire && (
          <Button
            size="sm"
            className={compact ? "w-full mt-2 h-8 px-2" : "w-full mt-3"}
            // The compact label is the short form; keep the full one as the accessible name.
            aria-label={compact ? "Mark as Acquired" : undefined}
            title={compact ? "Mark as Acquired" : undefined}
            onClick={(e) => {
              e.stopPropagation()
              onMarkAcquired(item)
            }}
          >
            {compact ? (
              <>
                <Check className="h-4 w-4 mr-1.5 shrink-0" />
                <span className="truncate">Acquired</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Mark as Acquired
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )

  if (!interactive) {
    return (
      <div className={cn(CARD_HOVER_MOTION_CLASS, "cursor-default")}>{card}</div>
    )
  }

  return (
    <Selectable
      selected={selected}
      selectionMode={selectionMode}
      className={cn("item-card-no-select", dragAttributes && "cursor-grab active:cursor-grabbing")}
      onClick={(e) => onClick?.(item, e)}
      {...dragAttributes}
    >
      {card}
    </Selectable>
  )
}
