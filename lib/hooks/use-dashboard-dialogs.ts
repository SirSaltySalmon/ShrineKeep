"use client"

import { useState } from "react"
import type { Box, Item } from "@/lib/types"

export function useDashboardDialogs() {
  const [editBox, setEditBox] = useState<Box | null>(null)
  const [editBoxName, setEditBoxName] = useState("")
  const [editBoxDescription, setEditBoxDescription] = useState("")
  const [showEditBoxDialog, setShowEditBoxDialog] = useState(false)
  const [savingEditBox, setSavingEditBox] = useState(false)
  const [deleteMode, setDeleteMode] = useState<"delete-all" | "move-to-root" | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [deletingBox, setDeletingBox] = useState(false)
  const [showDemoOfferDialog, setShowDemoOfferDialog] = useState(false)
  const [demoSeedLoading, setDemoSeedLoading] = useState(false)
  const [demoSeedError, setDemoSeedError] = useState<string | null>(null)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [markingAcquired, setMarkingAcquired] = useState(false)
  const [showItemCapUpsell, setShowItemCapUpsell] = useState(false)

  const openEditBox = (box: Box) => {
    setEditBox(box)
    setEditBoxName(box.name)
    setEditBoxDescription(box.description ?? "")
    setDeleteMode(null)
    setDeleteConfirmName("")
    setShowEditBoxDialog(true)
  }

  return {
    editBox,
    setEditBox,
    editBoxName,
    setEditBoxName,
    editBoxDescription,
    setEditBoxDescription,
    showEditBoxDialog,
    setShowEditBoxDialog,
    savingEditBox,
    setSavingEditBox,
    deleteMode,
    setDeleteMode,
    deleteConfirmName,
    setDeleteConfirmName,
    deletingBox,
    setDeletingBox,
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
