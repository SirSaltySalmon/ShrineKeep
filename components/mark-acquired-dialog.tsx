"use client"

import { useEffect, useState } from "react"
import { Item } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface MarkAcquiredDialogProps {
  item: Item | null
  open: boolean
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { acquisitionDate: string; acquisitionPrice: number | null }) => Promise<void>
}

export default function MarkAcquiredDialog({
  item,
  open,
  loading = false,
  onOpenChange,
  onConfirm,
}: MarkAcquiredDialogProps) {
  const [acquisitionDate, setAcquisitionDate] = useState("")
  const [acquisitionPrice, setAcquisitionPrice] = useState("")

  useEffect(() => {
    if (!open || !item) return
    setAcquisitionDate(new Date().toISOString().split("T")[0])
    setAcquisitionPrice(item.expected_price?.toString() ?? "")
  }, [open, item])

  const handleConfirm = async () => {
    if (!item) return
    const parsed = acquisitionPrice.trim() ? Number(acquisitionPrice) : null
    await onConfirm({
      acquisitionDate: acquisitionDate || new Date().toISOString().split("T")[0],
      acquisitionPrice: Number.isNaN(parsed) ? null : parsed,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>Mark as Acquired</DialogTitle>
          <DialogDescription>
            {item
              ? `Enter acquisition details for "${item.name}". The item will move out of your wishlist.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 layout-shrink-visible">
          <div className="grid gap-2 min-w-0">
            <Label>Acquisition date</Label>
            <Input
              type="date"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2 min-w-0">
            <Label>Acquisition price</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={acquisitionPrice}
              onChange={(e) => setAcquisitionPrice(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Saving..." : "Mark as Acquired"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
