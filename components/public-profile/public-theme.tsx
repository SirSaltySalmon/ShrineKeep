"use client"

import type { ReactNode } from "react"
import type { PublicStyle } from "@/lib/sharing/contracts"
import { publicStyleProperties } from "@/lib/sharing/presentation/style"

/** Applies an owner-shared style on this subtree only. Visitor/default theme stays on the document. */
export function PublicTheme({
  style,
  children,
}: {
  style: PublicStyle | null
  children: ReactNode
}) {
  const properties = publicStyleProperties(style)
  return (
    <div className="min-h-screen bg-background min-w-0" style={Object.keys(properties).length ? properties : undefined}>
      {children}
    </div>
  )
}
