import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("container audience fields", () => {
  const src = readFileSync(fileURLToPath(new URL("./container-audience-fields.tsx", import.meta.url)), "utf8")

  it("only lists audiences dominated by the parent ceiling", () => {
    expect(src).toContain("audiencesDominatedBy")
    expect(src).toContain("collectionCeiling")
    expect(src).toContain("wishlistCeiling")
    expect(src).not.toMatch(/AUDIENCES\.map/)
  })
})
