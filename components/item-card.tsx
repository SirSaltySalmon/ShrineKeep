"use client"

import { Item } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Image as ImageIcon, Check } from "lucide-react"
import ThumbnailImage from "./thumbnail-image"

interface ItemCardProps {
  item: Item
  variant: "collection" | "wishlist"
  onClick: (item: Item) => void
  onMarkAcquired?: (item: Item) => void
}

export default function ItemCard({
  item,
  variant,
  onClick,
  onMarkAcquired,
}: ItemCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => onClick(item)}
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
          <div className="space-y-1 text-fluid-sm min-w-0 overflow-hidden">
            {item.current_value !== null && item.current_value !== undefined && (
              <div className="font-medium truncate">Value: {formatCurrency(item.current_value)}</div>
            )}
            {item.acquisition_price !== null && item.acquisition_price !== undefined && (
              <div className="text-muted-foreground truncate">
                Acquired: {formatCurrency(item.acquisition_price)}
              </div>
            )}
            {item.acquisition_date && (
              <div className="text-muted-foreground text-fluid-xs truncate">
                {formatDate(item.acquisition_date)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-fluid-sm min-w-0 overflow-hidden">
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
