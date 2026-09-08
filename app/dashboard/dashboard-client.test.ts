import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("dashboard local item search", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./dashboard-client.tsx", import.meta.url)),
    "utf8",
  )

  it("keeps ItemGrid mounted when local search has no matches", () => {
    expect(src).not.toMatch(/searchQuery\.trim\(\)\s*&&\s*items\.length === 0/)
    expect(src).toContain("emptyText={localSearchEmptyText}")
  })

  it("filters the wishlist grid without using filtered length for tab chrome", () => {
    expect(src).toContain("items={visibleUnacquiredItems}")
    expect(src).toContain("currentBoxId && unacquiredItems.length > 0")
    expect(src).toContain("Wishlist ({unacquiredItems.length} remaining)")
    expect(src).toContain("No wishlist items in this box match your search.")
  })

  it("uses the shared box dialog for rename and sharing", () => {
    expect(src).toContain('from "@/components/box-dialog"')
    expect(src).toContain("<BoxDialog")
    expect(src).not.toContain("<ContainerAudienceFields")
  })

  it("opens the box editor from folder-loaded sharing instead of fetching after open", () => {
    expect(src).toContain("handleOpenEditBox")
    expect(src).toContain("openEditBox(latest)")
    expect(src).not.toContain("setBoxSharingLoaded")
    expect(src).not.toMatch(/showEditBoxDialog[\s\S]*\/api\/boxes\/\$\{boxId\}\/sharing/)
  })
})
