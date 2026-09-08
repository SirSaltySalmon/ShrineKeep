import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("root audience panel", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./root-audience-panel.tsx", import.meta.url)),
    "utf8",
  )

  it("uses the shared audience control for items not in a box", () => {
    expect(src).toContain("<ContainerAudienceFields")
    expect(src).toContain('containerLabel="Items not in a box"')
    expect(src).toContain("/api/settings/profile")
  })
})
