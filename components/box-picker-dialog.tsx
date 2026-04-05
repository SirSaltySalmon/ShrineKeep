"use client"

import { useEffect, useState } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box } from "@/lib/types"
import Breadcrumbs from "@/components/breadcrumbs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface BoxPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialBoxId: string | null
  onConfirm: (boxId: string | null) => void
}

export default function BoxPickerDialog({
  open,
  onOpenChange,
  initialBoxId,
  onConfirm,
}: BoxPickerDialogProps) {
  const supabase = createSupabaseClient()
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(initialBoxId)
  const [currentBox, setCurrentBox] = useState<Box | null>(null)
  const [childBoxes, setChildBoxes] = useState<Box[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrentBoxId(initialBoxId)
  }, [initialBoxId, open])

  useEffect(() => {
    if (!open) return

    const loadChildren = async () => {
      setLoading(true)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        let query = supabase
          .from("boxes")
          .select("*")
          .eq("user_id", user.id)
          .order("position", { ascending: true })

        if (currentBoxId) {
          query = query.eq("parent_box_id", currentBoxId)
          const { data: current } = await supabase
            .from("boxes")
            .select("*")
            .eq("id", currentBoxId)
            .eq("user_id", user.id)
            .single()
          setCurrentBox(current ?? null)
        } else {
          query = query.is("parent_box_id", null)
          setCurrentBox(null)
        }

        const { data, error } = await query
        if (error) throw error
        setChildBoxes(data ?? [])
      } catch (error) {
        console.error("Error loading boxes for picker:", error)
        setChildBoxes([])
        setCurrentBox(null)
      } finally {
        setLoading(false)
      }
    }

    loadChildren()
  }, [currentBoxId, open, supabase])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>Select Collection Box</DialogTitle>
          <DialogDescription>
            Navigate boxes like the dashboard. The selected box is the folder you are currently in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 layout-shrink-visible">
          <Breadcrumbs
            currentBoxId={currentBoxId}
            onBoxClick={(box) => setCurrentBoxId(box?.id ?? null)}
          />
          <div className="rounded-md border bg-muted/40 p-3 text-fluid-sm">
            Selected box: <span className="font-medium">{currentBox?.name ?? "None (root wishlist)"}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
            {loading && (
              <div className="text-fluid-sm text-muted-foreground col-span-full">Loading boxes...</div>
            )}
            {!loading && childBoxes.length === 0 && (
              <div className="text-fluid-sm text-muted-foreground col-span-full">
                No child boxes here.
              </div>
            )}
            {!loading &&
              childBoxes.map((box) => (
                <Card
                  key={box.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setCurrentBoxId(box.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setCurrentBoxId(box.id)
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-fluid-base truncate">{box.name}</CardTitle>
                  </CardHeader>
                  {box.description && (
                    <CardContent className="pt-0 text-fluid-sm text-muted-foreground line-clamp-2">
                      {box.description}
                    </CardContent>
                  )}
                </Card>
              ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setCurrentBoxId(null)}>
            Clear Association
          </Button>
          <Button
            onClick={() => {
              onConfirm(currentBoxId)
              onOpenChange(false)
            }}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
