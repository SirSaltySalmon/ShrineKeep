"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChevronRight, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BreadcrumbsProps {
  currentBoxId: string | null
  onBoxClick: (box: Box | null) => void
}

export default function Breadcrumbs({ currentBoxId, onBoxClick }: BreadcrumbsProps) {
  const [path, setPath] = useState<Box[]>([])
  const supabase = createSupabaseClient()

  useEffect(() => {
    loadPath()
  }, [currentBoxId])

  const loadPath = async () => {
    if (!currentBoxId) {
      setPath([])
      return
    }

    const boxes: Box[] = []
    let currentId: string | null = currentBoxId

    while (currentId) {
      const { data } = await supabase
        .from("boxes")
        .select("*")
        .eq("id", currentId)
        .single() as { data: Box | null }

      if (data) {
        boxes.unshift(data)
        currentId = data.parent_box_id || null
      } else {
        break
      }
    }

    setPath(boxes)
  }

  return (
    <nav className="flex items-center space-x-2 text-fluid-sm layout-shrink-visible">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onBoxClick(null)}
        className="h-8 shrink-0"
      >
        <Home className="h-4 w-4" />
      </Button>
      {path.map((box, index) => (
        <div
          key={box.id}
          className={cn(
            "flex items-center layout-shrink-visible",
            index === path.length - 1 && "min-w-0 flex-1"
          )}
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onBoxClick(box)}
            className="h-8 min-w-0 max-w-full overflow-hidden"
          >
            <span className="block min-w-0 truncate-line text-left">
              {box.name}
            </span>
          </Button>
        </div>
      ))}
    </nav>
  )
}
