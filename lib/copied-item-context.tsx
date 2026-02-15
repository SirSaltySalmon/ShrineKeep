"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { ItemCopyPayload } from "@/lib/types"

type CopiedItemContextValue = {
  copied: ItemCopyPayload[] | null
  setCopied: (payload: ItemCopyPayload | ItemCopyPayload[] | null) => void
}

const CopiedItemContext = createContext<CopiedItemContextValue | null>(null)

function normalizeCopied(
  payload: ItemCopyPayload | ItemCopyPayload[] | null
): ItemCopyPayload[] | null {
  if (payload === null) return null
  if (Array.isArray(payload)) return payload.length > 0 ? payload : null
  return [payload]
}

export function CopiedItemProvider({ children }: { children: ReactNode }) {
  const [copied, setCopiedState] = useState<ItemCopyPayload[] | null>(null)
  const setCopied = useCallback((payload: ItemCopyPayload | ItemCopyPayload[] | null) => {
    setCopiedState(normalizeCopied(payload))
  }, [])
  return (
    <CopiedItemContext.Provider value={{ copied, setCopied }}>
      {children}
    </CopiedItemContext.Provider>
  )
}

export function useCopiedItem() {
  const ctx = useContext(CopiedItemContext)
  if (!ctx) {
    return { copied: null as ItemCopyPayload[] | null, setCopied: () => {} }
  }
  return ctx
}
