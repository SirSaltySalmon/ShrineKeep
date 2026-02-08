"use client"

import { useState } from "react"
import { Item } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Image as ImageIcon } from "lucide-react"
import Image from "next/image"
import ItemDialog from "./item-dialog"

interface ItemGridProps {
  items: Item[]
  currentBoxId: string | null
  onItemUpdate: () => void
}

export default function ItemGrid({ items, currentBoxId, onItemUpdate }: ItemGridProps) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [isNewItem, setIsNewItem] = useState(false)

  const handleNewItem = () => {
    setIsNewItem(true)
    setSelectedItem(null)
    setShowItemDialog(true)
  }

  const handleItemClick = (item: Item) => {
    setIsNewItem(false)
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={handleNewItem}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <Card
            key={item.id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleItemClick(item)}
          >
            <div className="relative w-full h-48 bg-muted rounded-t-lg overflow-hidden">
              {item.thumbnail_url ? (
                <Image
                  src={item.thumbnail_url}
                  alt={item.name}
                  fill
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
                  <div className="font-medium">Value: {formatCurrency(item.current_value)}</div>
                )}
                {item.acquisition_price !== null && item.acquisition_price !== undefined && (
                  <div className="text-muted-foreground">
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
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No items yet. Click "Add Item" to get started.
        </div>
      )}
      <ItemDialog
        open={showItemDialog}
        onOpenChange={setShowItemDialog}
        item={selectedItem}
        isNew={isNewItem}
        boxId={currentBoxId}
        onSave={onItemUpdate}
      />
    </>
  )
}
