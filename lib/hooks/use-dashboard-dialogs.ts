"use client"

import { useState } from "react"
import type { Box, Item } from "@/lib/types"

export function useDashboardDialogs() {
  const [editBox, setEditBox] = useState<Box | null>(null)
  const [showEditBoxDialog, setShowEditBoxDialog] = useState(false)
  const [showDemoOfferDialog, setShowDemoOfferDialog] = useState(false)
  const [demoSeedLoading, setDemoSeedLoading] = useState(false)
  const [demoSeedError, setDemoSeedError] = useState<string | null>(null)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [markingAcquired, setMarkingAcquired] = useState(false)
  const [showItemCapUpsell, setShowItemCapUpsell] = useState(false)

  const openEditBox = (box: Box) => {
    setEditBox(box)
    setShowEditBoxDialog(true)
  }

  return {
    editBox,
    setEditBox,
    showEditBoxDialog,
    setShowEditBoxDialog,
    showDemoOfferDialog,
    setShowDemoOfferDialog,
    demoSeedLoading,
    setDemoSeedLoading,
    demoSeedError,
    setDemoSeedError,
    itemToMark,
    setItemToMark,
    markingAcquired,
    setMarkingAcquired,
    showItemCapUpsell,
    setShowItemCapUpsell,
    openEditBox,
  }
}
