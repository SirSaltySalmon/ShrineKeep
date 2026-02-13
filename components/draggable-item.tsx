"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Item } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDate } from "@/lib/utils"
import ThumbnailImage from "./thumbnail-image"
import { Image as ImageIcon } from "lucide-react"

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

interface DraggableItemProps {
  item: Item
  onClick: () => void
}

export default function DraggableItem({ item, onClick }: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={onClick}
        {...attributes}
        {...listeners}
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
          <CardTitle className="text-lg line-clamp-1">{item.name}</CardTitle>
          {item.description && (
            <CardDescription className="line-clamp-2">
              {item.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {item.current_value !== null && item.current_value !== undefined && (
              <div className="font-medium" style={{ color: getValueColor() }}>
                Value: {formatCurrency(item.current_value)}
              </div>
            )}
            {item.acquisition_price !== null && item.acquisition_price !== undefined && (
              <div style={{ color: getAcquisitionColor() }}>
                Acquired: {formatCurrency(item.acquisition_price)}
              </div>
            )}
            {item.acquisition_date && (
              <div className="text-muted-foreground text-xs">
                {formatDate(item.acquisition_date)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
