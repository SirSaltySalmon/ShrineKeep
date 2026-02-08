"use client"

import { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"

export function useDragDrop(items: Item[], onItemsChange: (items: Item[]) => void) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      const newItems = arrayMove(items, oldIndex, newIndex)
      onItemsChange(newItems)

      // Update positions in database
      const supabase = createSupabaseClient()
      for (let i = 0; i < newItems.length; i++) {
        await supabase
          .from("items")
          .update({ position: i })
          .eq("id", newItems[i].id)
      }
    }
  }

  return {
    sensors,
    handleDragEnd,
  }
}
