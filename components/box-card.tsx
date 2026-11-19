"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Package, Pencil, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Selectable, CARD_HOVER_MOTION_CLASS } from "@/components/selectable"
import { cn } from "@/lib/utils"
import BoxSparkline from "@/components/box-sparkline"
import { CardStatLine } from "@/components/card-stat-line"
import {
  BOX_SPARKLINE_HEIGHT,
  DEFAULT_CARD_DENSITY,
  getBoxCardMinHeightClass,
  type CardDensity,
} from "@/lib/card-density"
import type { CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import type { PresentedBox } from "@/lib/sharing/presentation/models"
import type { BoxSparklineSeries } from "@/lib/stats/box-sparkline"

interface BoxCardProps {
  box: PresentedBox
  capabilities: CollectionCapabilities
  selected?: boolean
  selectionMode?: boolean
  /** Parent DnD wrappers pass "embedded" so this card does not nest another Selectable. */
  frame?: "interactive" | "embedded"
  /** Card density for this device (`useCardDensity()` in the grid). Comfortable is the original layout. */
  density?: CardDensity
  /**
   * Value and cost over time, from `useBoxSparklines()` in the owner's grid.
   * Leave it out (public and showcase cards) and the card has no sparkline row at all.
   * Pass `null` while the series loads or when the box has no history: the row is kept
   * empty at the same height, so every card in the grid stays the same size.
   */
  sparkline?: BoxSparklineSeries | null
  onBoxClick: (box: PresentedBox, e: React.MouseEvent) => void
  onRename?: (box: PresentedBox) => void
  onShowStats?: (box: PresentedBox) => void
}

export default function BoxCard({
  box,
  capabilities,
  selected = false,
  selectionMode = false,
  onBoxClick,
  onRename,
  onShowStats,
  frame = "interactive",
  density = DEFAULT_CARD_DENSITY,
  sparkline,
}: BoxCardProps) {
  const interactive = frame === "interactive" && (
    capabilities.canSelect || capabilities.canEdit || capabilities.canDrag || capabilities.canOpenDetail
  )
  const compact = density === "compact"
  const hasSparklineRow = sparkline !== undefined
  const actionButtonClass = compact ? "h-7 w-7" : "h-8 w-8"

  const statsButton = capabilities.canShowStats && onShowStats ? (
    <Button
      variant="ghost"
      size="icon"
      className={actionButtonClass}
      onClick={(e) => {
        e.stopPropagation()
        onShowStats(box)
      }}
      aria-label="View value and acquisition graphs"
      title="Value & acquisition graphs"
    >
      <TrendingUp className="h-4 w-4" />
    </Button>
  ) : null
  const renameButton = capabilities.canRename && onRename ? (
    <Button
      variant="ghost"
      size="icon"
      className={actionButtonClass}
      onClick={(e) => {
        e.stopPropagation()
        onRename(box)
      }}
      aria-label="Rename box"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  ) : null
  const hasActions = statsButton !== null || renameButton !== null
  const actions = (
    <div className="flex shrink-0 gap-0.5">
      {statsButton}
      {renameButton}
    </div>
  )

  // "Label: figure" rows are the same element in both densities; `CardStatLine` lays them out.
  const totals = (
    <>
      {box.totalValue !== undefined && (
        <CardStatLine label="Total Value" value={formatCurrency(box.totalValue)} density={density} />
      )}
      {box.totalAcquisitionCost !== undefined && (
        <CardStatLine label="Acquired" value={formatCurrency(box.totalAcquisitionCost)} density={density} />
      )}
    </>
  )

  // The dashboard does not load box totals, so the card has no figures as text: the sparkline
  // is named with the two it ends on instead of being hidden as decoration.
  const sparklineRow = hasSparklineRow ? (
    <BoxSparkline
      series={sparkline}
      height={BOX_SPARKLINE_HEIGHT[density]}
      label={
        sparkline
          ? `Value ${formatCurrency(sparkline.currentValue)}, cost ${formatCurrency(sparkline.totalAcquisition)} over time`
          : undefined
      }
      reserveSpace
      className={compact ? "mt-1.5" : "mt-2"}
    />
  ) : null

  const card = compact ? (
    // Compact: the name gets the whole first row; the actions share the last row with the
    // item count, so a card half as wide still shows the name and both figures in full.
    <Card className={getBoxCardMinHeightClass(density, hasSparklineRow)}>
      <CardHeader className="p-3 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Two columns on a phone leave about 100px for the name: it needs the icon's share. */}
          <Package className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <CardTitle className="text-fluid-base min-w-0" title={box.name}>{box.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="text-fluid-sm leading-snug text-muted-foreground layout-shrink-visible">
          {totals}
          {(box.itemCount !== undefined || hasActions) && (
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="min-w-0 truncate">
                {box.itemCount !== undefined ? `${box.itemCount} items` : null}
              </span>
              {hasActions ? actions : null}
            </div>
          )}
        </div>
        {sparklineRow}
      </CardContent>
    </Card>
  ) : (
    <Card className={getBoxCardMinHeightClass(density, hasSparklineRow)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center space-x-2 layout-shrink-visible">
            <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground" />
            <CardTitle className="text-fluid-lg min-w-0" title={box.name}>{box.name}</CardTitle>
          </div>
          {actions}
        </div>
        {box.description && (
          <CardDescription className="line-clamp-2">
            {box.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-fluid-sm text-muted-foreground layout-shrink-visible">
          {totals}
          {box.itemCount !== undefined && (
            <div className="truncate">{box.itemCount} items</div>
          )}
        </div>
        {sparklineRow}
      </CardContent>
    </Card>
  )

  if (!interactive) {
    return (
      <div
        // Embedded: the wrapper around this card already lifts on hover and sets the cursor
        // (a grab hand); repeating either here would double the lift and hide the hand.
        className={frame === "embedded" ? undefined : cn(CARD_HOVER_MOTION_CLASS, "cursor-default")}
        onClick={(e) => onBoxClick(box, e)}
      >
        {card}
      </div>
    )
  }

  return (
    <Selectable
      selected={selected}
      selectionMode={selectionMode}
      className="item-card-no-select"
      onClick={(e) => onBoxClick(box, e)}
    >
      {card}
    </Selectable>
  )
}
