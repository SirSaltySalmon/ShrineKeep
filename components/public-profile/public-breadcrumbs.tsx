"use client"

import { Button } from "@/components/ui/button"
import { ChevronRight, Home } from "lucide-react"

export interface PublicBreadcrumb {
  id: string
  name: string
}

export function PublicBreadcrumbs({
  path,
  onRoot,
  onSelect,
}: {
  path: PublicBreadcrumb[]
  onRoot: () => void
  onSelect: (index: number) => void
}) {
  return (
    <nav className="flex items-center space-x-1 text-fluid-sm layout-shrink-visible min-w-0">
      <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={onRoot} aria-label="Collection root">
        <Home className="h-4 w-4" />
      </Button>
      {path.map((box, index) => (
        <div key={box.id} className="flex min-w-0 items-center">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 min-w-0 max-w-full overflow-hidden"
            onClick={() => onSelect(index)}
          >
            <span className="block min-w-0 truncate-line text-left">{box.name}</span>
          </Button>
        </div>
      ))}
    </nav>
  )
}
