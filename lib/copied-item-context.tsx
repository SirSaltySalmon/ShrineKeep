"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { ItemCopyPayload, BoxCopyPayload } from "@/lib/types"

type CopiedItemContextValue = {
  copied: ItemCopyPayload[] | null
  setCopied: (payload: ItemCopyPayload | ItemCopyPayload[] | null) => void
  copiedBoxTrees: BoxCopyPayload[] | null
  setCopiedBoxTrees: (trees: BoxCopyPayload[] | null) => void
  clearClipboard: () => void
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
  const [copiedBoxTrees, setCopiedBoxTreesState] = useState<BoxCopyPayload[] | null>(null)
  const setCopied = useCallback((payload: ItemCopyPayload | ItemCopyPayload[] | null) => {
    setCopiedState(normalizeCopied(payload))
  }, [])
  const setCopiedBoxTrees = useCallback((trees: BoxCopyPayload[] | null) => {
    setCopiedBoxTreesState(trees && trees.length > 0 ? trees : null)
  }, [])
  const clearClipboard = useCallback(() => {
    setCopiedState(null)
    setCopiedBoxTreesState(null)
  }, [])
  return (
    <CopiedItemContext.Provider
      value={{ copied, setCopied, copiedBoxTrees, setCopiedBoxTrees, clearClipboard }}
    >
      {children}
    </CopiedItemContext.Provider>
  )
}

export function useCopiedItem() {
  const ctx = useContext(CopiedItemContext)
  if (!ctx) {
    return {
      copied: null as ItemCopyPayload[] | null,
      setCopied: () => {},
      copiedBoxTrees: null as BoxCopyPayload[] | null,
      setCopiedBoxTrees: () => {},
      clearClipboard: () => {},
    }
  }
  return ctx
}
