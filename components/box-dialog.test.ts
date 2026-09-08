import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("box dialog layout", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./box-dialog.tsx", import.meta.url)),
    "utf8",
  )

  it("matches the item dialog shell instead of a nested scroller", () => {
    expect(src).toContain('DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0"')
    expect(src).toContain('className="space-y-4 py-4 layout-shrink-visible"')
    expect(src).not.toContain("overflow-y-auto py-4 pr-1")
  })

  it("keeps sharing on the same audience control as root and delete in the footer", () => {
    expect(src).toContain("<ContainerAudienceFields")
    expect(src).toContain("collectionCeiling={parentSharing?.collectionVisibility}")
    expect(src).toContain("privacy_conflict")
    expect(src).toContain("containerLabel={box.name}")
    expect(src).toContain('className="mr-auto"')
    expect(src).toContain("Delete")
  })
})
