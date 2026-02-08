"use client"

import { useState } from "react"
import { Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import DraggableItemCard from "./draggable-item-card"
import ItemDialog from "./item-dialog"

interface ItemGridProps {
  items: Item[]
  currentBoxId: string | null
  onItemUpdate: () => void
  /** When set, the section title and Add Item button are shown on one row (title left, button right). */
  sectionTitle?: string
}

export default function ItemGrid({ items, currentBoxId, onItemUpdate, sectionTitle }: ItemGridProps) {
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

  const addButton = (
    <Button onClick={handleNewItem}>
      <Plus className="h-4 w-4 mr-2" />
      Add Item
    </Button>
  )

  return (
    <>
      <div className={sectionTitle ? "flex items-center justify-between mb-4" : "mb-4"}>
        {sectionTitle ? (
          <>
            <h2 className="text-xl font-semibold">{sectionTitle}</h2>
            {addButton}
          </>
        ) : (
          addButton
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <DraggableItemCard
            key={item.id}
            item={item}
            onClick={handleItemClick}
          />
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
