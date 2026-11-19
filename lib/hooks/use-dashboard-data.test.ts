import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("dashboard folder load includes box editor sharing", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./use-dashboard-data.ts", import.meta.url)),
    "utf8",
  )

  it("loads descendant counts with the folder boxes query", () => {
    expect(src).toContain('select("id, parent_box_id")')
    expect(src).toContain("normalizeBox")
    expect(src).toContain("countDescendantsById")
  })

  it("derives child-box counts from the same tree read, with no extra request", () => {
    expect(src).toContain("countChildBoxesByParent(tree.data ?? [])")
    // One tree read per folder load: the counts must not add a second.
    expect(src.split('select("id, parent_box_id")')).toHaveLength(2)
  })

  it("keeps the boneyard folder skeleton up until owner sharing is ready", () => {
    expect(src).toContain("ownerSharingQuery.isPending")
    expect(src).toContain("/api/settings/profile")
  })
})
