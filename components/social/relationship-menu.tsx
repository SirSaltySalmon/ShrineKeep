"use client"

import Link from "next/link"
import { MoreHorizontal } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export interface RelationshipAction {
  id: string
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

interface RelationshipMenuProps {
  profileHref: string
  label: string
  actions: RelationshipAction[]
  disabled?: boolean
  children: React.ReactNode
}

export function RelationshipMenu({ profileHref, label, actions, disabled, children }: RelationshipMenuProps) {
  const actionItems = (kind: "context" | "dropdown") =>
    actions.map((action) =>
      kind === "context" ? (
        <ContextMenuItem
          key={action.id}
          disabled={action.disabled}
          className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
          onSelect={action.onSelect}
        >
          {action.label}
        </ContextMenuItem>
      ) : (
        <DropdownMenuItem
          key={action.id}
          disabled={action.disabled}
          destructive={action.destructive}
          onSelect={action.onSelect}
        >
          {action.label}
        </DropdownMenuItem>
      )
    )

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem asChild>
            <Link href={profileHref}>Open profile</Link>
          </ContextMenuItem>
          {actions.length > 0 ? <ContextMenuSeparator /> : null}
          {actionItems("context")}
        </ContextMenuContent>
      </ContextMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={profileHref}>Open profile</Link>
          </DropdownMenuItem>
          {actions.length > 0 ? <DropdownMenuSeparator /> : null}
          {actionItems("dropdown")}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
