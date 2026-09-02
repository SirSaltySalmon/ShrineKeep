"use client"

import { Bot, Layers3, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { selectionFloatingBottomOffset } from "@/lib/selection-floating-position"
import type { AgentSuggestionBatch } from "@/lib/webmcp/types"

interface Props {
  batches: AgentSuggestionBatch[]
  expanded: boolean
  actionBarVisible?: boolean
  onExpandedChange: (expanded: boolean) => void
  onReview: (stageId: string) => void
  onDiscard: (stageId: string) => void
}

function kindLabel(batch: AgentSuggestionBatch) {
  if (batch.kind === "create_items") {
    return batch.destination.kind === "new_box" ? "Collection setup" : "Add items"
  }
  if (batch.kind === "wishlist_price_edits") return "Wishlist edits"
  return "Owned-item edits"
}

export default function AgentStagingInbox({ batches, expanded, actionBarVisible = false, onExpandedChange, onReview, onDiscard }: Props) {
  if (batches.length === 0) return null
  const bottom = selectionFloatingBottomOffset(actionBarVisible)

  if (!expanded) return <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => onExpandedChange(true)} aria-label={`Open agent staging, ${batches.length} stages`} className="fixed left-6 z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-primary text-primary-foreground opacity-90 backdrop-blur shadow-lg transition-all duration-200 hover:scale-105 hover:opacity-100 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ bottom }}>
    <Layers3 className="h-5 w-5" />
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{batches.length}</span>
  </button>

  return <section onMouseDown={(event) => event.stopPropagation()} className="fixed left-6 z-30 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg" style={{ bottom }} aria-label="Agent staging inbox">
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary"><Bot className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1"><h2 className="text-fluid-sm font-semibold">Agent staging</h2><p className="text-fluid-xs text-muted-foreground">{batches.length} {batches.length === 1 ? "stage" : "stages"} waiting</p></div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onExpandedChange(false)} aria-label="Collapse agent staging"><X className="h-4 w-4" /></Button>
    </header>
    <div className="max-h-[22rem] space-y-2 overflow-y-auto p-3">
      {batches.map((batch) => <article key={batch.id} className="rounded-md border border-border bg-background p-3">
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-fluid-sm font-medium">{batch.title}</p><p className="text-fluid-xs text-muted-foreground">{kindLabel(batch)} · {batch.entries.length} {batch.entries.length === 1 ? "item" : "items"}</p></div><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onDiscard(batch.id)} aria-label={`Discard ${batch.title}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
        <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => onReview(batch.id)}>Review stage</Button>
      </article>)}
    </div>
  </section>
}
