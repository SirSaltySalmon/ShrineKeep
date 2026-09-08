import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("thumbnail image", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./thumbnail-image.tsx", import.meta.url)),
    "utf8",
  )

  it("fills the parent by default and can render without crop-fill", () => {
    expect(src).toContain("fill = true")
    expect(src).toContain('fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined')
  })
})
