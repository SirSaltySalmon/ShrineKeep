"use client"

import { Box } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Package } from "lucide-react"

interface BoxGridProps {
  boxes: Box[]
  onBoxClick: (box: Box) => void
}

export default function BoxGrid({ boxes, onBoxClick }: BoxGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {boxes.map((box) => (
        <Card
          key={box.id}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onBoxClick(box)}
        >
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{box.name}</CardTitle>
            </div>
            {box.description && (
              <CardDescription className="line-clamp-2">
                {box.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm text-muted-foreground">
              {box.total_value !== undefined && (
                <div>Total Value: {formatCurrency(box.total_value)}</div>
              )}
              {box.total_acquisition_cost !== undefined && (
                <div>Acquired: {formatCurrency(box.total_acquisition_cost)}</div>
              )}
              {box.item_count !== undefined && (
                <div>{box.item_count} items</div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
