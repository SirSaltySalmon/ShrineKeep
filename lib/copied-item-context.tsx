"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export interface CopiedItemRefs {
  itemIds: string[]
  /** For free-tier paste cap: sources with is_wishlist === false. */
  collectionSourceCount?: number
}

export interface CopiedBoxRefs {
  rootBoxIds: string[]
  /** Collection items only (excludes wishlist rows linked to boxes). */
  estimatedCreateCount?: number
}

type CopiedItemContextValue = {
  copiedItemRefs: CopiedItemRefs | null
  setCopiedItemRefs: (refs: CopiedItemRefs | null) => void
  copiedBoxRefs: CopiedBoxRefs | null
  setCopiedBoxRefs: (refs: CopiedBoxRefs | null) => void
  clearClipboard: () => void
}

const CopiedItemContext = createContext<CopiedItemContextValue | null>(null)

export function CopiedItemProvider({ children }: { children: ReactNode }) {
  const [copiedItemRefs, setCopiedItemRefsState] = useState<CopiedItemRefs | null>(null)
  const [copiedBoxRefs, setCopiedBoxRefsState] = useState<CopiedBoxRefs | null>(null)

  const setCopiedItemRefs = useCallback((refs: CopiedItemRefs | null) => {
    if (!refs || refs.itemIds.length === 0) {
      setCopiedItemRefsState(null)
      return
    }
    setCopiedItemRefsState({ ...refs, itemIds: Array.from(new Set(refs.itemIds)) })
  }, [])

  const setCopiedBoxRefs = useCallback((refs: CopiedBoxRefs | null) => {
    if (!refs || refs.rootBoxIds.length === 0) {
      setCopiedBoxRefsState(null)
      return
    }
    setCopiedBoxRefsState({ ...refs, rootBoxIds: Array.from(new Set(refs.rootBoxIds)) })
  }, [])

  const clearClipboard = useCallback(() => {
    setCopiedItemRefsState(null)
    setCopiedBoxRefsState(null)
  }, [])

  return (
    <CopiedItemContext.Provider
      value={{
        copiedItemRefs,
        setCopiedItemRefs,
        copiedBoxRefs,
        setCopiedBoxRefs,
        clearClipboard,
      }}
    >
      {children}
    </CopiedItemContext.Provider>
  )
}

export function useCopiedItem() {
  const ctx = useContext(CopiedItemContext)
  if (!ctx) {
    return {
      copiedItemRefs: null as CopiedItemRefs | null,
      setCopiedItemRefs: () => {},
      copiedBoxRefs: null as CopiedBoxRefs | null,
      setCopiedBoxRefs: () => {},
      clearClipboard: () => {},
    }
  }
  return ctx
}
