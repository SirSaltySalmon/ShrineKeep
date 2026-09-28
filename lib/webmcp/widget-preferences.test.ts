import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import WebMcpStatusPanel from "@/components/webmcp-status-panel"
import { COACH_STORAGE_KEY, coachStorageKey, initialCoachState, parseCoachState } from "./first-run-coach"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const props = {
  page: "dashboard" as const, status: "ready" as const, registeredToolCount: 0,
  toolCount: 0, tools: [], activity: [], invocationCount: 0, lastInvokedAt: null,
}

describe("AI widget preferences", () => {
  it("hides the default widget when the account preference is off", () => {
    expect(renderToStaticMarkup(createElement(WebMcpStatusPanel, { ...props, visible: false }))).toBe("")
  })

  it("keeps an active tutorial visible with collapse disabled and no hide action", () => {
    const html = renderToStaticMarkup(createElement(WebMcpStatusPanel, {
      ...props, visible: false,
      coach: {
        state: initialCoachState("u1"), nameDraft: "", onNameDraft: vi.fn(),
        onContinueName: vi.fn(), onSkipStep: vi.fn(), onSkip: vi.fn(), onSample: vi.fn(),
      },
    }))
    expect(html).toContain("Use AI with ShrineKeep")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-expanded="true"[^>]*aria-controls="agent-tutorial"/)
    expect(html).not.toContain("Don&#x27;t show this widget again")
  })

  it("offers hiding only when the default widget is expanded", () => {
    const collapsed = renderToStaticMarkup(createElement(WebMcpStatusPanel, props))
    const expanded = renderToStaticMarkup(createElement(WebMcpStatusPanel, { ...props, completionNotice: true }))
    expect(collapsed).not.toContain("Don&#x27;t show this widget again")
    expect(expanded).toContain("Don&#x27;t show this widget again")
    expect(expanded).toMatch(/<button[^>]*aria-expanded="true"[^>]*aria-controls="agent-feature-details"/)
  })

  it("preserves existing progress until restart, then ignores old completed progress", () => {
    const storage = new Map([[COACH_STORAGE_KEY, JSON.stringify({ ...initialCoachState("u1"), step: "done" })]])
    expect(parseCoachState(storage.get(coachStorageKey(null)) ?? null, "u1").step).toBe("done")
    expect(parseCoachState(storage.get(coachStorageKey("2026-09-07T00:00:00Z")) ?? null, "u1").step).toBe("ask_name")
  })
})
