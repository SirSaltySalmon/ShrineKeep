"use client"

import { useCallback, useState } from "react"
import { useWebMcpTool } from "@/lib/hooks/use-webmcp-tool"
import { useAgentStaging } from "@/lib/agent-staging-context"
import { selectedItemContext } from "@/lib/webmcp/selection-context"
import { addFirstImageThumbnails } from "@/lib/webmcp/thumbnail-search"
import { creationDescription } from "@/lib/webmcp/description-context"
import {
  acquisitionPriceFieldDescription,
  attachPriceEvidenceFieldDescription,
  collectionInitializationToolDescription,
  creationEvidenceDescriptionFieldDescription,
  creationNameGuidance,
  creationRationaleFieldDescription,
  creationStatusFieldDescription,
  currentBoxItemCreationToolDescription,
  currentBoxItemsToolDescription,
  currentValueFieldDescription,
  expectedPriceFieldDescription,
  includeDescendantsFieldDescription,
  itemEditsToolDescription,
  ownedEditRationaleFieldDescription,
  replacementDescriptionFieldDescription,
  selectedItemsToolDescription,
  userConfirmedMatchFieldDescription,
  wishlistContextToolDescription,
  wishlistEditRationaleFieldDescription,
  wishlistEditsToolDescription,
} from "@/lib/webmcp/tool-context"
import type { Item } from "@/lib/types"
import type {
  AgentCreateItemsBatch,
  AgentItemEditBatch,
  AgentSuggestionBatch,
  AgentSuggestionSource,
  AgentWishlistPriceBatch,
  ApprovedCreatedItem,
  ApprovedItemEdit,
  ApprovedWishlistPriceEdit,
} from "@/lib/webmcp/types"

interface UseAgentSuggestionsOptions {
  userId?: string
  page: "dashboard" | "wishlist"
  currentBoxId?: string | null
  currentBoxName?: string
  selectedItems?: readonly Item[]
  onApplied: () => void | Promise<void>
  onToolStart?: (name: string) => void
  onApplySuccess?: (event: {
    sourceTool: string
    boxId: string | null
    appliedCount: number
  }) => void
}

interface ContextItem {
  id: string
  name: string
  description: string | null
  description_truncated: boolean
  description_urls: string[]
  current_value: number | null
  acquisition_price: number | null
  tags: Array<{ id: string; name: string }>
  updated_at: string
}

interface WishlistContextItem {
  id: string
  name: string
  description: string | null
  description_truncated: boolean
  description_urls: string[]
  expected_price: number | null
  current_value: number | null
  tags: Array<{ id: string; name: string }>
  updated_at: string
  target_box_id: string | null
  target_box_name: string
}

interface CreateCandidate {
  description: string | null
  name: string
  itemKind: "collection" | "wishlist"
  currentValue: number | null
  acquisitionPrice: number | null
  expectedPrice: number | null
  rationale: string
  sources: AgentSuggestionSource[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalPrice(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 99_999_999.99) {
    throw new Error("Suggested prices must be finite, non-negative numbers")
  }
  return value
}

function optionalName(value: unknown, index: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error(`Suggestion ${index + 1} has an invalid name`)
  const name = value.trim()
  if (!name || name.length > 200) {
    throw new Error(`Suggestion ${index + 1} name must contain 1-200 characters`)
  }
  return name
}

function optionalDescription(value: unknown, index: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string" || value.length > 10_000) {
    throw new Error(`Suggestion ${index + 1} has an invalid description`)
  }
  return value.trim() || null
}

function safeSources(value: unknown): AgentSuggestionSource[] {
  if (!Array.isArray(value)) return []
  const sources: AgentSuggestionSource[] = []
  for (const candidate of value.slice(0, 5)) {
    if (typeof candidate !== "string") continue
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        sources.push({ url: parsed.toString() })
      }
    } catch {
      // Malformed evidence URLs are omitted; the concise rationale remains reviewable.
    }
  }
  return sources
}

function createCandidates(
  input: unknown,
  statusField: "initial_status" | "status",
  maxItems: number,
  attachPriceEvidence: unknown
): CreateCandidate[] {
  if (attachPriceEvidence !== undefined && typeof attachPriceEvidence !== "boolean") {
    throw new Error("attach_price_evidence must be a boolean")
  }
  if (!Array.isArray(input) || input.length === 0 || input.length > maxItems) {
    throw new Error(`items must contain 1-${maxItems} entries`)
  }
  const seen = new Set<string>()
  return input.flatMap((raw, index) => {
    if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name.trim()) {
      throw new Error(`Item ${index + 1} requires a name`)
    }
    const name = raw.name.trim().slice(0, 200)
    const description = creationDescription(raw.description, attachPriceEvidence === true)
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) return []
    seen.add(key)

    const status = raw[statusField] === "owned" ? "owned" : "wishlist"
    const currentValue = optionalPrice(raw.current_value)
    const acquisitionPrice = optionalPrice(raw.acquisition_price)
    const expectedPrice = optionalPrice(raw.expected_price)
    if (status === "wishlist" && acquisitionPrice !== undefined) {
      throw new Error(`Item ${index + 1} is wishlist and cannot include acquisition_price`)
    }
    if (status === "owned" && expectedPrice !== undefined) {
      throw new Error(`Item ${index + 1} is owned and cannot include expected_price`)
    }

    return [{
      name,
      description,
      itemKind: status === "owned" ? "collection" as const : "wishlist" as const,
      currentValue: currentValue ?? null,
      acquisitionPrice: acquisitionPrice ?? null,
      expectedPrice: expectedPrice ?? null,
      rationale: typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 300) : "",
      sources: safeSources(raw.source_urls),
    }]
  })
}

function toolResult(message: string, details?: Record<string, unknown>) {
  return { content: [{ type: "text", text: JSON.stringify({ message, ...details }) }] }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `Request failed with status ${response.status}`)
  return payload
}

export function useAgentSuggestions({
  userId,
  page,
  currentBoxId = null,
  currentBoxName = "Root",
  selectedItems = [],
  onApplied,
  onToolStart,
  onApplySuccess,
}: UseAgentSuggestionsOptions) {
  const { batches, expanded, addBatch, removeBatch, updateBatch, setExpanded } = useAgentStaging()
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const batch = batches.find((candidate) => candidate.id === reviewBatchId) ?? null
  const dashboardEnabled = Boolean(userId) && page === "dashboard"
  const wishlistEnabled = Boolean(userId)

  const selectedItemsTool = useWebMcpTool(
    {
      name: "get_selected_items",
      title: "Read explicitly selected items",
      description: selectedItemsToolDescription(page),
      inputSchema: {
        type: "object",
        properties: {
          include_full_description: { type: "boolean", default: false },
          offset: { type: "integer", minimum: 0, default: 0 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input) => {
        return toolResult("Selected items loaded", {
          scope: page === "wishlist" ? "Wishlist" : currentBoxName,
          ...selectedItemContext(selectedItems, input),
        })
      },
    },
    wishlistEnabled,
    onToolStart
  )

  const stageBatch = useCallback(
    (nextBatch: AgentSuggestionBatch) => {
      addBatch(nextBatch)
      setError(null)
      setReviewBatchId(nextBatch.id)
    },
    [addBatch]
  )

  const stageCreateCandidates = useCallback(
    async ({
      candidates,
      title,
      setSourceUrl,
      destination,
      attachPriceEvidence,
      signal,
    }: {
      candidates: CreateCandidate[]
      title: string
      setSourceUrl: string | null
      destination: AgentCreateItemsBatch["destination"]
      attachPriceEvidence: boolean
      signal?: AbortSignal
    }) => {
      const createNewBox = destination.kind === "new_box"
      const previewResponse = await fetch("/api/items/suggestions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          mode: "preview",
          attach_price_evidence: attachPriceEvidence,
          createNewBox,
          parentBoxId: createNewBox ? destination.parentBoxId : null,
          targetBoxId: createNewBox ? null : destination.boxId,
          newBoxName: createNewBox ? destination.newBoxName : undefined,
          items: candidates.map((item) => ({
            description: item.description,
            name: item.name,
            item_kind: item.itemKind,
            current_value: item.currentValue,
            acquisition_price: item.acquisitionPrice,
            expected_price: item.expectedPrice,
          })),
        }),
      })
      const preview = await parseJsonResponse<{
        items: Array<{ name: string; existingMatch: "collection" | "wishlist" | null }>
      }>(previewResponse)
      const matchByName = new Map(
        preview.items.map((item) => [item.name.toLocaleLowerCase(), item.existingMatch])
      )
      const nextBatch: AgentCreateItemsBatch = {
        id: crypto.randomUUID(),
        kind: "create_items",
        attachPriceEvidence,
        title,
        setSourceUrl,
        destination,
        createdAt: new Date().toISOString(),
        entries: candidates.map((item, index) => ({
          key: `${index}-${item.name}`,
          ...item,
          existingMatch: matchByName.get(item.name.toLocaleLowerCase()) ?? null,
        })),
      }
      stageBatch(nextBatch)
      return nextBatch
    },
    [stageBatch]
  )

  const collectionContextTool = useWebMcpTool(
    {
      name: "get_current_box_items",
      title: "Read owned items in current box",
      description: currentBoxItemsToolDescription(currentBoxName),
      inputSchema: {
        type: "object",
        properties: {
          include_descendants: {
            type: "boolean",
            description: includeDescendantsFieldDescription,
            default: false,
          },
          include_full_description: { type: "boolean", default: false },
          offset: { type: "integer", minimum: 0, default: 0 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        const offset =
          typeof input.offset === "number" && Number.isInteger(input.offset) && input.offset >= 0
            ? input.offset
            : 0
        const limit =
          typeof input.limit === "number" && Number.isInteger(input.limit)
            ? Math.max(1, Math.min(10, input.limit))
            : 5
        const response = await fetch("/api/agent/collection-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options?.signal,
          body: JSON.stringify({
            boxId: currentBoxId,
            includeDescendants: input.include_descendants === true,
            includeFullDescription: input.include_full_description === true,
            offset,
            limit,
          }),
        })
        const data = await parseJsonResponse<{
          items: ContextItem[]
          total: number
          nextOffset: number | null
        }>(response)
        return toolResult("Owned-item context loaded", {
          scope: currentBoxName,
          itemKind: "collection_only",
          ...data,
        })
      },
    },
    dashboardEnabled,
    onToolStart
  )

  const itemEditsTool = useWebMcpTool(
    {
      name: "stage_item_edits",
      title: "Stage owned item edits",
      description: itemEditsToolDescription(),
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 120 },
          suggestions: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                item_id: { type: "string" },
                name: { type: "string", maxLength: 200 },
                description: {
                  type: "string",
                  maxLength: 10_000,
                  description: replacementDescriptionFieldDescription,
                },
                current_value: { type: "number", minimum: 0 },
                acquisition_price: { type: "number", minimum: 0 },
                rationale: {
                  type: "string",
                  maxLength: 300,
                  description: ownedEditRationaleFieldDescription,
                },
                source_urls: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string", format: "uri" },
                },
              },
              required: ["item_id"],
              additionalProperties: false,
            },
          },
        },
        required: ["suggestions"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        if (!Array.isArray(input.suggestions) || input.suggestions.length === 0 || input.suggestions.length > 100) {
          throw new Error("suggestions must contain 1-100 entries")
        }
        const proposed = input.suggestions.map((raw, index) => {
          if (!isRecord(raw) || typeof raw.item_id !== "string" || !raw.item_id) {
            throw new Error(`Suggestion ${index + 1} requires item_id`)
          }
          const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 300) : ""
          const proposedName = optionalName(raw.name, index)
          const proposedDescription = optionalDescription(raw.description, index)
          const currentValue = optionalPrice(raw.current_value)
          const acquisitionPrice = optionalPrice(raw.acquisition_price)
          const hasPriceEdit = currentValue !== undefined || acquisitionPrice !== undefined
          if (hasPriceEdit && !rationale) {
            throw new Error(`Suggestion ${index + 1} price edits require a rationale`)
          }
          if (
            proposedName === undefined &&
            proposedDescription === undefined &&
            !hasPriceEdit
          ) {
            throw new Error(`Suggestion ${index + 1} must include an editable field`)
          }
          return {
            itemId: raw.item_id,
            proposedName,
            proposedDescription,
            proposedCurrentValue: currentValue,
            proposedAcquisitionPrice: acquisitionPrice,
            rationale,
            sources: safeSources(raw.source_urls),
          }
        })
        const response = await fetch("/api/agent/collection-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options?.signal,
          body: JSON.stringify({ itemIds: proposed.map((entry) => entry.itemId), includeFullDescription: true }),
        })
        const context = await parseJsonResponse<{ items: ContextItem[] }>(response)
        const byId = new Map(context.items.map((item) => [item.id, item]))
        const entries = proposed.flatMap((entry, index) => {
          const item = byId.get(entry.itemId)
          return item
            ? [{
                key: `${item.id}-${index}`,
                itemId: item.id,
                itemName: item.name,
                beforeUpdatedAt: item.updated_at,
                beforeCurrentValue: item.current_value,
                beforeAcquisitionPrice: item.acquisition_price,
                beforeDescription: item.description,
                proposedName: entry.proposedName,
                proposedDescription: entry.proposedDescription,
                proposedCurrentValue: entry.proposedCurrentValue,
                proposedAcquisitionPrice: entry.proposedAcquisitionPrice,
                rationale: entry.rationale,
                sources: entry.sources,
              }]
            : []
        })
        if (entries.length === 0) throw new Error("No proposed ids resolve to possessed items")
        const nextBatch: AgentItemEditBatch = {
          id: crypto.randomUUID(),
          kind: "item_edits",
          title:
            typeof input.title === "string" && input.title.trim()
              ? input.title.trim().slice(0, 120)
              : "Owned-item edits",
          scopeName: currentBoxName,
          createdAt: new Date().toISOString(),
          entries,
        }
        stageBatch(nextBatch)
        return toolResult("Owned-item edit stage added to ShrineKeep", {
          stageId: nextBatch.id,
          staged: entries.length,
          unresolved: proposed.length - entries.length,
          inboxCount: batches.length + 1,
        })
      },
    },
    dashboardEnabled,
    onToolStart
  )

  const collectionInitializationTool = useWebMcpTool(
    {
      name: "stage_collection_initialization",
      title: "Stage a new researched collection box",
      description: collectionInitializationToolDescription(currentBoxName),
      inputSchema: {
        type: "object",
        properties: {
          attach_price_evidence: { type: "boolean", default: false, description: attachPriceEvidenceFieldDescription },
          user_confirmed_match: {
            type: "boolean",
            enum: [true],
            description: userConfirmedMatchFieldDescription,
          },
          collection_name: { type: "string", maxLength: 200 },
          source_url: { type: "string", format: "uri" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 500,
            items: {
              type: "object",
              properties: {
                name: { type: "string", maxLength: 200, description: creationNameGuidance },
                initial_status: {
                  type: "string",
                  enum: ["wishlist", "owned"],
                  default: "wishlist",
                  description: creationStatusFieldDescription,
                },
                description: { type: "string", maxLength: 10_000, description: creationEvidenceDescriptionFieldDescription },
                current_value: {
                  type: "number",
                  minimum: 0,
                  description: currentValueFieldDescription,
                },
                acquisition_price: {
                  type: "number",
                  minimum: 0,
                  description: acquisitionPriceFieldDescription,
                },
                expected_price: {
                  type: "number",
                  minimum: 0,
                  description: expectedPriceFieldDescription,
                },
                rationale: {
                  type: "string",
                  maxLength: 300,
                  description: creationRationaleFieldDescription,
                },
                source_urls: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string", format: "uri" },
                },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
        },
        required: ["user_confirmed_match", "collection_name", "items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        if (input.user_confirmed_match !== true) {
          throw new Error("Ask the user to approve the matched collection in chat before staging")
        }
        const collectionName =
          typeof input.collection_name === "string" ? input.collection_name.trim().slice(0, 200) : ""
        if (!collectionName) throw new Error("collection_name is required")
        const candidates = createCandidates(input.items, "initial_status", 500, input.attach_price_evidence)
        const nextBatch = await stageCreateCandidates({
          candidates,
          title: `Initialize ${collectionName}`,
          attachPriceEvidence: input.attach_price_evidence === true,
          setSourceUrl: safeSources(input.source_url ? [input.source_url] : [])[0]?.url ?? null,
          destination: {
            kind: "new_box",
            parentBoxId: currentBoxId,
            parentBoxName: currentBoxName,
            newBoxName: collectionName,
          },
          signal: options?.signal,
        })
        return toolResult("Collection initialization added to staging", {
          stageId: nextBatch.id,
          boxName: collectionName,
          parentBoxName: currentBoxName,
          staged: nextBatch.entries.length,
          nextStep: "The user chooses Owned or Wishlist per row, then approves creation in ShrineKeep.",
        })
      },
    },
    dashboardEnabled,
    onToolStart
  )

  const createItemsInCurrentBoxTool = useWebMcpTool(
    {
      name: "stage_items_in_current_box",
      title: "Stage items in the open box",
      description: currentBoxItemCreationToolDescription(currentBoxName),
      inputSchema: {
        type: "object",
        properties: {
          attach_price_evidence: { type: "boolean", default: false, description: attachPriceEvidenceFieldDescription },
          title: { type: "string", maxLength: 120 },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                name: { type: "string", maxLength: 200, description: creationNameGuidance },
                status: {
                  type: "string",
                  enum: ["wishlist", "owned"],
                  default: "wishlist",
                  description: creationStatusFieldDescription,
                },
                description: { type: "string", maxLength: 10_000, description: creationEvidenceDescriptionFieldDescription },
                current_value: {
                  type: "number",
                  minimum: 0,
                  description: currentValueFieldDescription,
                },
                acquisition_price: {
                  type: "number",
                  minimum: 0,
                  description: acquisitionPriceFieldDescription,
                },
                expected_price: {
                  type: "number",
                  minimum: 0,
                  description: expectedPriceFieldDescription,
                },
                rationale: {
                  type: "string",
                  maxLength: 300,
                  description: creationRationaleFieldDescription,
                },
                source_urls: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string", format: "uri" },
                },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        const candidates = createCandidates(input.items, "status", 100, input.attach_price_evidence)
        const title =
          typeof input.title === "string" && input.title.trim()
            ? input.title.trim().slice(0, 120)
            : `Add items to ${currentBoxName}`
        const nextBatch = await stageCreateCandidates({
          candidates,
          title,
          attachPriceEvidence: input.attach_price_evidence === true,
          setSourceUrl: null,
          destination: {
            kind: "current_box",
            boxId: currentBoxId,
            boxName: currentBoxName,
          },
          signal: options?.signal,
        })
        const owned = nextBatch.entries.filter((entry) => entry.itemKind === "collection").length
        const wishlist = nextBatch.entries.length - owned
        const exactMatches = nextBatch.entries.filter((entry) => entry.existingMatch).length
        return toolResult("Current-box item stage added to ShrineKeep", {
          stageId: nextBatch.id,
          destinationBoxName: currentBoxName,
          staged: nextBatch.entries.length,
          owned,
          wishlist,
          exactMatchesUnselected: exactMatches,
          nextStep: "The user reviews the new cards and approves creation in ShrineKeep.",
        })
      },
    },
    dashboardEnabled,
    onToolStart
  )

  const wishlistContextTool = useWebMcpTool(
    {
      name: page === "wishlist" ? "get_all_wishlist_items" : "get_current_box_wishlist_items",
      title: page === "wishlist" ? "Read all wishlist items" : "Read wishlist items in current box",
      description: wishlistContextToolDescription(page, currentBoxName),
      inputSchema: {
        type: "object",
        properties: {
          include_full_description: { type: "boolean", default: false },
          offset: { type: "integer", minimum: 0, default: 0 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        const offset =
          typeof input.offset === "number" && Number.isInteger(input.offset) && input.offset >= 0
            ? input.offset
            : 0
        const limit =
          typeof input.limit === "number" && Number.isInteger(input.limit)
            ? Math.max(1, Math.min(10, input.limit))
            : 5
        const response = await fetch("/api/agent/wishlist-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options?.signal,
          body: JSON.stringify({
            all: page === "wishlist",
            includeFullDescription: input.include_full_description === true,
            boxId: page === "dashboard" ? currentBoxId : null,
            offset,
            limit,
          }),
        })
        const data = await parseJsonResponse<{
          items: WishlistContextItem[]
          total: number
          nextOffset: number | null
        }>(response)
        return toolResult("Wishlist context loaded", {
          scope: page === "wishlist" ? "All wishlist items" : currentBoxName,
          ...data,
        })
      },
    },
    wishlistEnabled,
    onToolStart
  )

  const wishlistEditTool = useWebMcpTool(
    {
      name: "stage_wishlist_edits",
      title: "Stage wishlist item edits",
      description: wishlistEditsToolDescription(page),
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 120 },
          suggestions: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                item_id: { type: "string" },
                name: { type: "string", maxLength: 200 },
                description: {
                  type: "string",
                  maxLength: 10_000,
                  description: replacementDescriptionFieldDescription,
                },
                current_value: { type: "number", minimum: 0 },
                expected_price: { type: "number", minimum: 0 },
                rationale: {
                  type: "string",
                  maxLength: 300,
                  description: wishlistEditRationaleFieldDescription,
                },
                source_urls: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string", format: "uri" },
                },
              },
              required: ["item_id"],
              additionalProperties: false,
            },
          },
        },
        required: ["suggestions"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        if (!Array.isArray(input.suggestions) || input.suggestions.length === 0 || input.suggestions.length > 100) {
          throw new Error("suggestions must contain 1-100 entries")
        }
        const proposed = input.suggestions.map((raw, index) => {
          if (!isRecord(raw) || typeof raw.item_id !== "string" || !raw.item_id) {
            throw new Error(`Suggestion ${index + 1} requires item_id`)
          }
          const expectedPrice = optionalPrice(raw.expected_price)
          const currentValue = optionalPrice(raw.current_value)
          const proposedName = optionalName(raw.name, index)
          const proposedDescription = optionalDescription(raw.description, index)
          const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 300) : ""
          const hasPriceEdit = expectedPrice !== undefined || currentValue !== undefined
          if (hasPriceEdit && !rationale) {
            throw new Error(`Suggestion ${index + 1} price edits require a rationale`)
          }
          if (
            proposedName === undefined &&
            proposedDescription === undefined &&
            !hasPriceEdit
          ) {
            throw new Error(`Suggestion ${index + 1} must include an editable field`)
          }
          return {
            itemId: raw.item_id,
            proposedName,
            proposedDescription,
            proposedExpectedPrice: expectedPrice,
            proposedCurrentValue: currentValue,
            rationale,
            sources: safeSources(raw.source_urls),
          }
        })
        const response = await fetch("/api/agent/wishlist-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options?.signal,
          body: JSON.stringify({ itemIds: proposed.map((entry) => entry.itemId), includeFullDescription: true }),
        })
        const context = await parseJsonResponse<{ items: WishlistContextItem[] }>(response)
        const allowedItems = context.items.filter(
          (item) => page === "wishlist" || item.target_box_id === currentBoxId
        )
        const byId = new Map(allowedItems.map((item) => [item.id, item]))
        const entries = proposed.flatMap((entry, index) => {
          const item = byId.get(entry.itemId)
          return item
            ? [{
                key: `${item.id}-${index}`,
                itemId: item.id,
                itemName: item.name,
                boxName: item.target_box_name,
                beforeUpdatedAt: item.updated_at,
                beforeExpectedPrice: item.expected_price,
                beforeCurrentValue: item.current_value,
                beforeDescription: item.description,
                proposedName: entry.proposedName,
                proposedDescription: entry.proposedDescription,
                proposedExpectedPrice: entry.proposedExpectedPrice,
                proposedCurrentValue: entry.proposedCurrentValue,
                rationale: entry.rationale,
                sources: entry.sources,
              }]
            : []
        })
        if (entries.length === 0) throw new Error("No proposed ids are wishlist items in this scope")
        const nextBatch: AgentWishlistPriceBatch = {
          id: crypto.randomUUID(),
          kind: "wishlist_price_edits",
          title:
            typeof input.title === "string" && input.title.trim()
              ? input.title.trim().slice(0, 120)
              : "Wishlist item edits",
          scopeName: page === "wishlist" ? "All wishlist items" : currentBoxName,
          createdAt: new Date().toISOString(),
          entries,
        }
        stageBatch(nextBatch)
        return toolResult("Wishlist item edit stage added to ShrineKeep", {
          stageId: nextBatch.id,
          staged: entries.length,
          unresolved: proposed.length - entries.length,
        })
      },
    },
    wishlistEnabled,
    onToolStart
  )

  const finishApply = useCallback(
    async (stageId: string) => {
      removeBatch(stageId)
      setReviewBatchId(null)
      await onApplied()
    },
    [onApplied, removeBatch]
  )

  const applyItemEdits = useCallback(
    async (changes: ApprovedItemEdit[]) => {
      if (!batch || batch.kind !== "item_edits") return
      setApplying(true)
      setError(null)
      try {
        const response = await fetch("/api/items/suggestions/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
        })
        const result = await parseJsonResponse<{
          success: boolean
          applied: string[]
          failed: Array<{ id: string; error: string }>
        }>(response)
        if (result.failed.length > 0) {
          throw new Error(`${result.applied.length} edits applied; ${result.failed.length} failed`)
        }
        await onApplySuccess?.({
          sourceTool: "stage_item_edits",
          boxId: currentBoxId,
          appliedCount: result.applied.length,
        })
        await finishApply(batch.id)
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Failed to apply item edits")
        throw cause
      } finally {
        setApplying(false)
      }
    },
    [batch, currentBoxId, finishApply, onApplySuccess]
  )

  const applyCreatedItems = useCallback(
    async (items: ApprovedCreatedItem[], useFirstImageAsThumbnail = true) => {
      if (!batch || batch.kind !== "create_items") return
      setApplying(true)
      setError(null)
      try {
        const itemsWithImages = useFirstImageAsThumbnail
          ? await addFirstImageThumbnails(items)
          : items
        const createNewBox = batch.destination.kind === "new_box"
        const response = await fetch("/api/items/suggestions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "apply",
            attach_price_evidence: batch.attachPriceEvidence === true,
            createNewBox,
            parentBoxId: batch.destination.kind === "new_box" ? batch.destination.parentBoxId : null,
            targetBoxId: batch.destination.kind === "current_box" ? batch.destination.boxId : null,
            newBoxName: batch.destination.kind === "new_box" ? batch.destination.newBoxName : undefined,
            items: itemsWithImages,
          }),
        })
        const created = await parseJsonResponse<{ success: boolean; boxId: string | null; itemIds: string[] }>(response)
        await onApplySuccess?.({
          sourceTool:
            batch.destination.kind === "new_box"
              ? "stage_collection_initialization"
              : "stage_items_in_current_box",
          boxId: created.boxId,
          appliedCount: created.itemIds.length,
        })
        await finishApply(batch.id)
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Failed to create staged items")
        throw cause
      } finally {
        setApplying(false)
      }
    },
    [batch, finishApply, onApplySuccess]
  )

  const applyWishlistPriceEdits = useCallback(
    async (changes: ApprovedWishlistPriceEdit[]) => {
      if (!batch || batch.kind !== "wishlist_price_edits") return
      setApplying(true)
      setError(null)
      try {
        const response = await fetch("/api/wishlist/suggestions/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
        })
        const result = await parseJsonResponse<{
          success: boolean
          applied: string[]
          failed: Array<{ id: string; error: string }>
        }>(response)
        if (result.failed.length > 0) {
          throw new Error(`${result.applied.length} edits applied; ${result.failed.length} failed`)
        }
        await onApplySuccess?.({
          sourceTool: "stage_wishlist_edits",
          boxId: currentBoxId,
          appliedCount: result.applied.length,
        })
        await finishApply(batch.id)
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Failed to apply wishlist prices")
        throw cause
      } finally {
        setApplying(false)
      }
    },
    [batch, currentBoxId, finishApply, onApplySuccess]
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (applying) return
    if (!nextOpen) {
      setReviewBatchId(null)
      setError(null)
    }
  }
  const discardStage = (stageId: string) => {
    removeBatch(stageId)
    if (reviewBatchId === stageId) setReviewBatchId(null)
  }

  const enabledToolStates =
    page === "dashboard"
      ? [
          selectedItemsTool,
          collectionContextTool,
          itemEditsTool,
          collectionInitializationTool,
          createItemsInCurrentBoxTool,
          wishlistContextTool,
          wishlistEditTool,
        ]
      : [selectedItemsTool, wishlistContextTool, wishlistEditTool]
  const registeredToolCount = enabledToolStates.filter((tool) => tool.status === "ready").length
  const webMcpStatus: "ready" | "checking" | "unsupported" | "error" | "disabled" =
    enabledToolStates.every((tool) => tool.status === "ready")
      ? "ready"
      : enabledToolStates.some((tool) => tool.status === "error")
        ? "error"
        : enabledToolStates.every((tool) => tool.status === "disabled")
          ? "disabled"
          : enabledToolStates.some((tool) => tool.status === "unsupported")
            ? "unsupported"
            : "checking"
  const invocationCount = enabledToolStates.reduce((total, tool) => total + tool.invocationCount, 0)
  const lastInvokedAt = enabledToolStates.reduce<string | null>(
    (latest, tool) =>
      tool.lastInvokedAt && (!latest || tool.lastInvokedAt > latest) ? tool.lastInvokedAt : latest,
    null
  )
  const activity = enabledToolStates
    .flatMap((tool) => tool.activity)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 30)

  return {
    batch,
    batches,
    open: Boolean(batch),
    applying,
    error,
    inboxExpanded: expanded,
    setInboxExpanded: setExpanded,
    reviewStage: setReviewBatchId,
    discardStage,
    persistReview: (next: AgentSuggestionBatch) => updateBatch(next.id, next),
    onOpenChange: handleOpenChange,
    applyItemEdits,
    applyCreatedItems,
    applyWishlistPriceEdits,
    coachToolStatuses: [
      collectionInitializationTool.status,
      itemEditsTool.status,
      wishlistEditTool.status,
    ] as const,
    webMcp: {
      status: webMcpStatus,
      registeredToolCount,
      toolCount: enabledToolStates.length,
      tools: enabledToolStates.map((tool) => ({ ...tool.tool, status: tool.status })),
      activity,
      invocationCount,
      lastInvokedAt,
    },
  }
}
