"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import type { AgentSuggestionBatch } from "@/lib/webmcp/types"

interface AgentStagingContextValue {
  batches: AgentSuggestionBatch[]
  expanded: boolean
  addBatch: (batch: AgentSuggestionBatch) => void
  removeBatch: (batchId: string) => void
  setExpanded: (expanded: boolean) => void
}

const AgentStagingContext = createContext<AgentStagingContextValue | null>(null)

export function AgentStagingProvider({ children }: { children: ReactNode }) {
  const [batches, setBatches] = useState<AgentSuggestionBatch[]>([])
  const batchesRef = useRef<AgentSuggestionBatch[]>([])
  const [expanded, setExpanded] = useState(false)

  const addBatch = useCallback((batch: AgentSuggestionBatch) => {
    const next = [...batchesRef.current, batch]
    batchesRef.current = next
    setBatches(next)
    setExpanded(true)
  }, [])

  const removeBatch = useCallback((batchId: string) => {
    const next = batchesRef.current.filter((batch) => batch.id !== batchId)
    batchesRef.current = next
    setBatches(next)
  }, [])

  return (
    <AgentStagingContext.Provider
      value={{ batches, expanded, addBatch, removeBatch, setExpanded }}
    >
      {children}
    </AgentStagingContext.Provider>
  )
}

export function useAgentStaging(): AgentStagingContextValue {
  const context = useContext(AgentStagingContext)
  if (!context) throw new Error("useAgentStaging must be used inside AgentStagingProvider")
  return context
}
