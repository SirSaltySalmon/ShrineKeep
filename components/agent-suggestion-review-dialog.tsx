"use client"

import { useMemo, useState } from "react"
import { Bot, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/utils"
import { buildApprovedCreatedItems } from "@/lib/webmcp/review"
import type { AgentCreateItemSuggestion, AgentItemEditSuggestion, AgentSuggestionBatch, AgentWishlistPriceSuggestion, ApprovedCreatedItem, ApprovedItemEdit, ApprovedWishlistPriceEdit } from "@/lib/webmcp/types"

interface Props {
  batch: AgentSuggestionBatch | null
  open: boolean
  applying: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onDiscard: (stageId: string) => void
  onApplyItemEdits: (changes: ApprovedItemEdit[]) => Promise<void>
  onApplyCreatedItems: (
    items: ApprovedCreatedItem[],
    useFirstImageAsThumbnail: boolean
  ) => Promise<void>
  onApplyWishlistPriceEdits: (changes: ApprovedWishlistPriceEdit[]) => Promise<void>
}

function price(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
}

function Sources({ sources }: { sources: Array<{ url: string }> }) {
  if (sources.length === 0) return null
  return <div className="flex flex-wrap gap-2">{sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-fluid-xs text-primary hover:bg-accent">Evidence {index + 1} <ExternalLink className="h-3 w-3" /></a>)}</div>
}

function TagsChange({ before, after }: { before: string[]; after: string[] }) {
  return <div className="sm:col-span-2"><Label>Tags</Label><p className="text-fluid-xs text-muted-foreground">Before: {before.length > 0 ? before.join(", ") : "None"}</p><p className="mt-1 rounded-md border bg-background px-3 py-2 text-fluid-sm">After: {after.length > 0 ? after.join(", ") : "None"}</p></div>
}

const IMAGE_SEARCH_DEFAULT_OFF_AT = 30

export default function AgentSuggestionReviewDialog({ batch, open, applying, error, onOpenChange, onDiscard, onApplyItemEdits, onApplyCreatedItems, onApplyWishlistPriceEdits }: Props) {
  const [imageSearchOverride, setImageSearchOverride] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(batch?.entries.filter((entry) => !("existingMatch" in entry && entry.existingMatch)).map((entry) => entry.key) ?? []))
  const [itemDrafts, setItemDrafts] = useState<AgentItemEditSuggestion[]>(() => batch?.kind === "item_edits" ? batch.entries.map((entry) => ({ ...entry })) : [])
  const [createDrafts, setCreateDrafts] = useState<AgentCreateItemSuggestion[]>(() => batch?.kind === "create_items" ? batch.entries.map((entry) => ({ ...entry })) : [])
  const [wishlistDrafts, setWishlistDrafts] = useState<AgentWishlistPriceSuggestion[]>(() => batch?.kind === "wishlist_price_edits" ? batch.entries.map((entry) => ({ ...entry })) : [])
  const total = batch?.entries.length ?? 0
  const allSelected = total > 0 && selected.size === total
  const toggle = (key: string, value: boolean) => setSelected((previous) => { const next = new Set(previous); if (value) next.add(key); else next.delete(key); return next })

  const approvedItemEdits = useMemo(() => itemDrafts.flatMap<ApprovedItemEdit>((entry) => {
    if (!selected.has(entry.key)) return []
    const change: ApprovedItemEdit = { id: entry.itemId, expected_updated_at: entry.beforeUpdatedAt }
    if (entry.proposedName !== undefined) change.name = entry.proposedName
    if (entry.proposedDescription !== undefined) change.description = entry.proposedDescription
    if (entry.proposedTagIds !== undefined) change.tag_ids = entry.proposedTagIds
    if (entry.proposedCurrentValue !== undefined) change.current_value = entry.proposedCurrentValue
    if (entry.proposedAcquisitionPrice !== undefined) change.acquisition_price = entry.proposedAcquisitionPrice
    return change.name === undefined && change.description === undefined && change.tag_ids === undefined && change.current_value === undefined && change.acquisition_price === undefined ? [] : [change]
  }), [itemDrafts, selected])
  const attachPriceEvidence = batch?.kind === "create_items" && batch.attachPriceEvidence === true
  const approvedCreatedItems = useMemo(() => buildApprovedCreatedItems(createDrafts, selected, attachPriceEvidence), [createDrafts, selected, attachPriceEvidence])
  const approvedWishlistPrices = useMemo(() => wishlistDrafts.flatMap<ApprovedWishlistPriceEdit>((entry) => {
    if (!selected.has(entry.key)) return []
    const change: ApprovedWishlistPriceEdit = { id: entry.itemId, expected_updated_at: entry.beforeUpdatedAt }
    if (entry.proposedName !== undefined) change.name = entry.proposedName
    if (entry.proposedDescription !== undefined) change.description = entry.proposedDescription
    if (entry.proposedTagIds !== undefined) change.tag_ids = entry.proposedTagIds
    if (entry.proposedCurrentValue !== undefined) change.current_value = entry.proposedCurrentValue
    if (entry.proposedExpectedPrice !== undefined) change.expected_price = entry.proposedExpectedPrice
    return change.name === undefined && change.description === undefined && change.tag_ids === undefined && change.current_value === undefined && change.expected_price === undefined ? [] : [change]
  }), [wishlistDrafts, selected])
  const approvedCount = batch?.kind === "item_edits" ? approvedItemEdits.length : batch?.kind === "create_items" ? approvedCreatedItems.length : approvedWishlistPrices.length
  const largeImageSearchBatch = approvedCreatedItems.length >= IMAGE_SEARCH_DEFAULT_OFF_AT
  const useFirstImageAsThumbnail = imageSearchOverride ?? !largeImageSearchBatch

  const apply = () => {
    if (!batch || approvedCount === 0 || applying) return
    const task = batch.kind === "item_edits" ? onApplyItemEdits(approvedItemEdits) : batch.kind === "create_items" ? onApplyCreatedItems(approvedCreatedItems, useFirstImageAsThumbnail) : onApplyWishlistPriceEdits(approvedWishlistPrices)
    void task.catch(() => undefined)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
      <DialogHeader><div className="flex items-start gap-3"><div className="rounded-full bg-primary/10 p-2 text-primary"><Bot className="h-5 w-5" /></div><div><DialogTitle>{batch?.title ?? "Review agent stage"}</DialogTitle><DialogDescription>Edit values before approval.</DialogDescription></div></div></DialogHeader>
      {batch && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="rounded-lg border bg-light-muted p-3 text-fluid-sm">{batch.kind === "create_items" ? <div className="space-y-1"><p>{batch.destination.kind === "new_box" ? <>New box: <span className="font-medium">{batch.destination.newBoxName}</span> under <span className="font-medium">{batch.destination.parentBoxName}</span></> : <>Add cards to current box: <span className="font-medium">{batch.destination.boxName}</span></>}</p>{batch.setSourceUrl && <a href={batch.setSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Collection source <ExternalLink className="h-3.5 w-3.5" /></a>}</div> : <p>Scope: <span className="font-medium">{batch.scopeName}</span></p>}</div>
        {batch.kind === "create_items" && <label className="flex items-start gap-3 rounded-lg border bg-light-muted p-3 text-fluid-sm"><Check checked={useFirstImageAsThumbnail} onChange={setImageSearchOverride} label="Use first image found based on item title to set as thumbnail" /><span><span className="font-medium">Use first image found based on item title to set as thumbnail</span>{largeImageSearchBatch && <span className="ml-1.5 text-fluid-xs font-normal text-muted-foreground">Off by default for 30 or more images.</span>}<span className="mt-0.5 block text-fluid-xs text-muted-foreground">ShrineKeep will search for each selected item when you approve this stage.</span></span></label>}
        <p className="text-fluid-xs text-muted-foreground"><span className="font-medium text-foreground">Pricing disclosure:</span> Prices are estimates and exclude shipping unless noted. They are verified recent sold prices only when the evidence explicitly identifies sold data.</p>

        <div className="flex items-center justify-between gap-2"><span className="text-fluid-sm text-muted-foreground">{selected.size} of {total} selected</span><Button type="button" size="sm" variant="outline" disabled={applying} onClick={() => setSelected(allSelected ? new Set() : new Set(batch.entries.map((entry) => entry.key)))}>{allSelected ? "Select none" : "Select all"}</Button></div>

        {batch.kind === "item_edits" && itemDrafts.map((entry, index) => <div key={entry.key} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3"><Check checked={selected.has(entry.key)} onChange={(value) => toggle(entry.key, value)} label={`Apply ${entry.itemName}`} /><div className="min-w-0 flex-1"><h3 className="font-medium">{entry.proposedName ?? entry.itemName}</h3>{entry.rationale && <p className="mt-1 text-fluid-sm text-muted-foreground">{entry.rationale}</p>}</div></div>
          {(entry.proposedName !== undefined || entry.proposedDescription !== undefined || entry.proposedTagNames !== undefined) && <div className="grid gap-3 pl-7 sm:grid-cols-2">
            {entry.proposedName !== undefined && <div><Label>Name</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.itemName}</p><Input value={entry.proposedName} maxLength={200} onChange={(event) => setItemDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedName: event.target.value } : draft))} /></div>}
            {entry.proposedDescription !== undefined && <div className={entry.proposedName === undefined ? "sm:col-span-2" : undefined}><Label>Description</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeDescription || "Not set"}</p><Textarea value={entry.proposedDescription ?? ""} maxLength={10000} onChange={(event) => setItemDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedDescription: event.target.value || null } : draft))} /></div>}
            {entry.proposedTagNames !== undefined && <TagsChange before={entry.beforeTagNames} after={entry.proposedTagNames} />}
          </div>}
          <div className="grid gap-3 pl-7 sm:grid-cols-2">{entry.proposedCurrentValue !== undefined && <div><Label>Current value</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeCurrentValue == null ? "Not set" : formatCurrency(entry.beforeCurrentValue)}</p><Input type="number" min="0" step="0.01" value={entry.proposedCurrentValue ?? ""} onChange={(event) => setItemDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedCurrentValue: price(event.target.value) } : draft))} /></div>}{entry.proposedAcquisitionPrice !== undefined && <div><Label>Acquisition estimate</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeAcquisitionPrice == null ? "Not set" : formatCurrency(entry.beforeAcquisitionPrice)}</p><Input type="number" min="0" step="0.01" value={entry.proposedAcquisitionPrice ?? ""} onChange={(event) => setItemDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedAcquisitionPrice: price(event.target.value) } : draft))} /></div>}</div><div className="pl-7"><Sources sources={entry.sources} /></div>
        </div>)}

        {batch.kind === "create_items" && createDrafts.map((entry, index) => <div key={entry.key} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3"><Check checked={selected.has(entry.key)} onChange={(value) => toggle(entry.key, value)} label={`Create ${entry.name}`} /><div className="min-w-0 flex-1"><Label>Item name</Label><Input value={entry.name} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, name: event.target.value } : draft))} />{entry.existingMatch && <p className="mt-1 text-fluid-xs font-medium text-amber-700 dark:text-amber-300">A matching {entry.existingMatch} item exists. Unselected by default.</p>}</div></div>
          <div className="grid gap-3 pl-7 sm:grid-cols-2"><div><Label>Place item in</Label><Select value={entry.itemKind} onValueChange={(value: "collection" | "wishlist") => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, itemKind: value } : draft))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collection">Owned collection</SelectItem><SelectItem value="wishlist">Wishlist</SelectItem></SelectContent></Select></div>{entry.itemKind === "wishlist" ? <div className="grid grid-cols-2 gap-2"><div><Label>Valuation</Label><Input type="number" min="0" step="0.01" value={entry.currentValue ?? ""} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, currentValue: price(event.target.value) ?? null } : draft))} /></div><div><Label>Expected price</Label><Input type="number" min="0" step="0.01" value={entry.expectedPrice ?? ""} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, expectedPrice: price(event.target.value) ?? null } : draft))} /></div></div> : <div className="grid grid-cols-2 gap-2"><div><Label>Current value</Label><Input type="number" min="0" step="0.01" value={entry.currentValue ?? ""} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, currentValue: price(event.target.value) ?? null } : draft))} /></div><div><Label>Acquisition</Label><Input type="number" min="0" step="0.01" value={entry.acquisitionPrice ?? ""} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, acquisitionPrice: price(event.target.value) ?? null } : draft))} /></div></div>}</div>
          {attachPriceEvidence && <div className="pl-7"><Label htmlFor={`evidence-${entry.key}`}>Description with price evidence</Label><Textarea id={`evidence-${entry.key}`} value={entry.description ?? ""} maxLength={10000} onChange={(event) => setCreateDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, description: event.target.value || null } : draft))} /><p className="mt-1 text-fluid-xs text-muted-foreground">Saved with this item for future research. Edit or clear before approving.</p></div>}
          {(entry.rationale || entry.sources.length > 0) && <div className="space-y-2 pl-7 text-fluid-sm text-muted-foreground">{entry.rationale && <p>{entry.rationale}</p>}<Sources sources={entry.sources} /></div>}
        </div>)}

        {batch.kind === "wishlist_price_edits" && wishlistDrafts.map((entry, index) => <div key={entry.key} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3"><Check checked={selected.has(entry.key)} onChange={(value) => toggle(entry.key, value)} label={`Apply ${entry.itemName}`} /><div className="min-w-0 flex-1"><h3 className="font-medium">{entry.proposedName ?? entry.itemName}</h3><p className="text-fluid-xs text-muted-foreground">Collection: {entry.boxName}</p>{entry.rationale && <p className="mt-1 text-fluid-sm text-muted-foreground">{entry.rationale}</p>}</div></div>
          {(entry.proposedName !== undefined || entry.proposedDescription !== undefined || entry.proposedTagNames !== undefined) && <div className="grid gap-3 pl-7 sm:grid-cols-2">
            {entry.proposedName !== undefined && <div><Label>Name</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.itemName}</p><Input value={entry.proposedName} maxLength={200} onChange={(event) => setWishlistDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedName: event.target.value } : draft))} /></div>}
            {entry.proposedDescription !== undefined && <div className={entry.proposedName === undefined ? "sm:col-span-2" : undefined}><Label>Description</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeDescription || "Not set"}</p><Textarea value={entry.proposedDescription ?? ""} maxLength={10000} onChange={(event) => setWishlistDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedDescription: event.target.value || null } : draft))} /></div>}
            {entry.proposedTagNames !== undefined && <TagsChange before={entry.beforeTagNames} after={entry.proposedTagNames} />}
          </div>}
          <div className="grid gap-3 pl-7 sm:grid-cols-2">{entry.proposedCurrentValue !== undefined && <div><Label>Valuation</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeCurrentValue == null ? "Not set" : formatCurrency(entry.beforeCurrentValue)}</p><Input type="number" min="0" step="0.01" value={entry.proposedCurrentValue ?? ""} onChange={(event) => setWishlistDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedCurrentValue: price(event.target.value) } : draft))} /></div>}{entry.proposedExpectedPrice !== undefined && <div><Label>Expected price</Label><p className="mb-1 text-fluid-xs text-muted-foreground">Before: {entry.beforeExpectedPrice == null ? "Not set" : formatCurrency(entry.beforeExpectedPrice)}</p><Input type="number" min="0" step="0.01" value={entry.proposedExpectedPrice ?? ""} onChange={(event) => setWishlistDrafts((drafts) => drafts.map((draft, i) => i === index ? { ...draft, proposedExpectedPrice: price(event.target.value) } : draft))} /></div>}</div><div className="pl-7"><Sources sources={entry.sources} /></div>
        </div>)}
      </div>}
      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-fluid-sm text-destructive">{error}</div>}
      <DialogFooter className="sm:justify-between"><Button type="button" variant="destructive" disabled={!batch || applying} onClick={() => batch && onDiscard(batch.id)}>Discard stage</Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>Close for later</Button><Button type="button" disabled={!batch || applying || approvedCount === 0} onClick={apply}>{applying ? "Applying…" : `Approve ${approvedCount} selected`}</Button></div></DialogFooter>
    </DialogContent>
  </Dialog>
}
