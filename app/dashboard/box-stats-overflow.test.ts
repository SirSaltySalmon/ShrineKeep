import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("box stats overflow policy", () => {
  const contentSrc = readFileSync(
    fileURLToPath(new URL("../../components/box-stats-content.tsx", import.meta.url)),
    "utf8",
  )
  const panelSrc = readFileSync(
    fileURLToPath(new URL("../../components/box-stats-panel.tsx", import.meta.url)),
    "utf8",
  )

  it("keeps overflow-y-hidden on the cards summary grid", () => {
    expect(contentSrc).toContain(
      "grid grid-cols-2 gap-4 min-w-0 overflow-x-auto overflow-y-hidden",
    )
  })

  it("keeps overflow-y-hidden on the inline summary row", () => {
    expect(contentSrc).toContain(
      "flex items-center gap-10 min-w-0 overflow-x-auto overflow-y-hidden",
    )
  })

  it("does not use overflow-auto on the panel summary wrapper", () => {
    expect(panelSrc).toContain(
      "flex flex-wrap items-center gap-4 sm:gap-6 min-w-0 overflow-x-auto overflow-y-hidden",
    )
    expect(panelSrc).not.toMatch(/overflow-auto/)
  })
})
