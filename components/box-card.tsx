"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Package, Pencil, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Selectable, CARD_HOVER_MOTION_CLASS } from "@/components/selectable"
import { cn } from "@/lib/utils"
import type { CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import type { PresentedBox } from "@/lib/sharing/presentation/models"

interface BoxCardProps {
  box: PresentedBox
  capabilities: CollectionCapabilities
  selected?: boolean
  selectionMode?: boolean
  /** Parent DnD wrappers pass "embedded" so this card does not nest another Selectable. */
  frame?: "interactive" | "embedded"
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
}: BoxCardProps) {
  const interactive = frame === "interactive" && (
    capabilities.canSelect || capabilities.canEdit || capabilities.canDrag || capabilities.canOpenDetail
  )
  const card = (
    <Card className="min-h-[152px]">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center space-x-2 layout-shrink-visible">
            <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground" />
            <CardTitle className="text-fluid-lg min-w-0" title={box.name}>{box.name}</CardTitle>
          </div>
          <div className="flex shrink-0 gap-0.5">
            {capabilities.canShowStats && onShowStats && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onShowStats(box)
                }}
                aria-label="View value and acquisition graphs"
                title="Value & acquisition graphs"
              >
                <TrendingUp className="h-4 w-4" />
              </Button>
            )}
            {capabilities.canRename && onRename && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onRename(box)
                }}
                aria-label="Rename box"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {box.description && (
          <CardDescription className="line-clamp-2">
            {box.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-fluid-sm text-muted-foreground layout-shrink-visible">
          {box.totalValue !== undefined && (
            <div className="truncate">Total Value: {formatCurrency(box.totalValue)}</div>
          )}
          {box.totalAcquisitionCost !== undefined && (
            <div className="truncate">Acquired: {formatCurrency(box.totalAcquisitionCost)}</div>
          )}
          {box.itemCount !== undefined && (
            <div className="truncate">{box.itemCount} items</div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (!interactive) {
    return (
      <div className={cn(CARD_HOVER_MOTION_CLASS, "cursor-default")} onClick={(e) => onBoxClick(box, e)}>
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
