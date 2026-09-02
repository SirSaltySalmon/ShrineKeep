import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAgentSuggestions } from "./use-agent-suggestions"
import { buildApprovedCreatedItems } from "@/lib/webmcp/review"
import type { AgentSuggestionBatch } from "@/lib/webmcp/types"

interface Tool {
  name: string
  inputSchema: { properties: Record<string, unknown> }
  execute: (input: Record<string, unknown>) => Promise<unknown>
}

const harness = vi.hoisted(() => ({
  tools: new Map<string, Tool>(), batches: [] as AgentSuggestionBatch[],
  states: [] as unknown[], cursor: 0,
}))

// Exercise the registered handlers and their requests without a browser session.
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.states)) harness.states[index] = initial
    return [harness.states[index], (value: unknown) => { harness.states[index] = value }]
  },
}))
vi.mock("@/lib/agent-staging-context", () => ({
  useAgentStaging: () => ({
    batches: harness.batches, expanded: false, setExpanded: vi.fn(),
    addBatch: (batch: AgentSuggestionBatch) => harness.batches.push(batch), removeBatch: vi.fn(),
  }),
}))
vi.mock("@/lib/hooks/use-webmcp-tool", () => ({
  useWebMcpTool: (tool: Tool) => {
    harness.tools.set(tool.name, tool)
    return { status: "ready", tool, activity: [], invocationCount: 0, lastInvokedAt: null }
  },
}))

function render(page: "dashboard" | "wishlist" = "dashboard") {
  harness.cursor = 0
  // React hooks are mocked above so handlers can run without a React renderer.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAgentSuggestions({ userId: "user-1", page, currentBoxId: "box-1", onApplied: vi.fn() })
}

describe("pricing evidence MCP flow", () => {
  beforeEach(() => {
    harness.tools.clear()
    harness.batches.length = 0
    harness.states.length = 0
  })
  afterEach(() => vi.unstubAllGlobals())

  for (const name of ["stage_collection_initialization", "stage_items_in_current_box"]) {
    it.each(["A", "B", "C"])(`${name}: approval %s survives staging, review and apply`, async (choice) => {
      const requests: Record<string, unknown>[] = []
      vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body)
        requests.push(body)
        return Response.json(body.mode === "preview"
          ? { items: [{ name: "Blue edition", existingMatch: null }] }
          : { success: true, itemIds: ["new-1"], boxId: "box-1" })
      }))
      render()
      const evidence = "Blue edition; retail USD 25; checked 2026-09-02. https://shop.example.com/blue"
      await harness.tools.get(name)!.execute({
        user_confirmed_match: true, collection_name: "Collection",
        attach_price_evidence: choice === "C",
        items: [{ name: "Blue edition", status: "wishlist", initial_status: "wishlist",
          ...(choice !== "A" ? { expected_price: 25, source_urls: ["https://shop.example.com/blue"] } : {}),
          ...(choice === "C" ? { description: evidence } : {}),
        }],
      })
      const batch = harness.batches[0]
      if (batch.kind !== "create_items") throw new Error("Expected creation stage")
      expect(batch.attachPriceEvidence).toBe(choice === "C")
      expect(batch.entries[0].description).toBe(choice === "C" ? evidence : null)
      if (choice === "C") batch.entries[0].description += " Reviewed."
      const approved = buildApprovedCreatedItems(batch.entries, new Set(batch.entries.map((row) => row.key)), batch.attachPriceEvidence)
      await render().applyCreatedItems(approved, false)
      expect(requests[1]).toMatchObject({ mode: "apply", attach_price_evidence: choice === "C" })
      const item = (requests[1].items as { description?: string; expected_price: number | null }[])[0]
      expect(item.description).toBe(choice === "C" ? `${evidence} Reviewed.` : undefined)
      expect(item.expected_price).toBe(choice === "A" ? null : 25)
    })

    it(`${name}: rejects unapproved description before preview`, async () => {
      const fetch = vi.fn()
      vi.stubGlobal("fetch", fetch)
      render()
      await expect(harness.tools.get(name)!.execute({
        user_confirmed_match: true, collection_name: "Collection",
        items: [{ name: "Item", description: "Unapproved evidence" }],
      })).rejects.toThrow("explicit")
      expect(fetch).not.toHaveBeenCalled()
    })
  }

  it.each(["dashboard", "wishlist"] as const)("exposes full-description reads on %s", async (page) => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (url === "/api/tags") return Response.json([])
      bodies.push(JSON.parse(init.body))
      return Response.json({ items: [], total: 0, nextOffset: null })
    }))
    render(page)
    const names = page === "dashboard" ? ["get_current_box_items", "get_current_box_wishlist_items"] : ["get_all_wishlist_items"]
    for (const name of [...names, "get_selected_items"]) {
      expect(harness.tools.get(name)!.inputSchema.properties).toHaveProperty("include_full_description")
      await harness.tools.get(name)!.execute({ include_full_description: true })
    }
    expect(bodies.every((body) => body.includeFullDescription === true)).toBe(true)
  })

  it.each(["stage_item_edits", "stage_wishlist_edits"])("%s loads full before-notes and keeps price-only edits sparse", async (name) => {
    const description = "Personal note. ".repeat(50) + "https://shop.example.com/exact"
    const requests: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body))
      return Response.json({ items: [{ id: "item-1", name: "Item", description, tags: [], updated_at: "version-1", target_box_id: "box-1" }] })
    }))
    render()
    await harness.tools.get(name)!.execute({ suggestions: [{ item_id: "item-1", current_value: 20, rationale: "Recent sold evidence" }] })
    expect(requests[0].includeFullDescription).toBe(true)
    const batch = harness.batches[0]
    if (batch.kind === "create_items") throw new Error("Expected edit stage")
    expect(batch.entries[0].beforeDescription).toBe(description)
    expect(batch.entries[0].proposedDescription).toBeUndefined()
  })
})
