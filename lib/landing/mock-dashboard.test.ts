import { describe, expect, it } from "vitest"
import { ownedInSubtree, pathTo, resolveDrop, subtreeIds, type BoxNode, type PlacedItem } from "./mock-dashboard"

/*
 * root
 * ├─ mecha
 * │  └─ backlog
 * │     └─ deep
 * └─ vinyl
 */
const boxes: BoxNode[] = [
  { id: "mecha", parentId: null },
  { id: "vinyl", parentId: null },
  { id: "backlog", parentId: "mecha" },
  { id: "deep", parentId: "backlog" },
]

const items: PlacedItem[] = [
  { id: "loose", boxId: null },
  { id: "kit", boxId: "mecha" },
  { id: "unbuilt", boxId: "backlog" },
  { id: "buried", boxId: "deep" },
  { id: "record", boxId: "vinyl" },
  { id: "wanted", boxId: "mecha", wishlist: true },
]

const ids = (list: { id: string }[]) => list.map((entry) => entry.id)
const state = (openBoxId: string | null) => ({ boxes, items, openBoxId })

describe("subtreeIds", () => {
  it("holds the box and everything nested under it, at any depth", () => {
    expect(Array.from(subtreeIds(boxes, "mecha")).sort()).toEqual(["backlog", "deep", "mecha"])
    expect(Array.from(subtreeIds(boxes, "vinyl"))).toEqual(["vinyl"])
  })

  it("does not depend on the order boxes are listed in", () => {
    expect(Array.from(subtreeIds([...boxes].reverse(), "mecha")).sort()).toEqual(["backlog", "deep", "mecha"])
  })
})

describe("ownedInSubtree", () => {
  it("rolls up nested boxes", () => {
    expect(ids(ownedInSubtree(items, boxes, "mecha"))).toEqual(["kit", "unbuilt", "buried"])
    expect(ids(ownedInSubtree(items, boxes, "backlog"))).toEqual(["unbuilt", "buried"])
  })

  it("covers the whole collection, loose items included, at the root", () => {
    expect(ids(ownedInSubtree(items, boxes, null))).toEqual(["loose", "kit", "unbuilt", "buried", "record"])
  })

  it("leaves wishlist items out of every total", () => {
    expect(ids(ownedInSubtree(items, boxes, "mecha"))).not.toContain("wanted")
    expect(ids(ownedInSubtree(items, boxes, null))).not.toContain("wanted")
  })
})

describe("pathTo", () => {
  it("lists ancestors root-first, ending at the box", () => {
    expect(ids(pathTo(boxes, "deep"))).toEqual(["mecha", "backlog", "deep"])
    expect(ids(pathTo(boxes, "vinyl"))).toEqual(["vinyl"])
  })

  it("is empty at the root and for an unknown box", () => {
    expect(pathTo(boxes, null)).toEqual([])
    expect(pathTo(boxes, "gone")).toEqual([])
  })
})

describe("resolveDrop", () => {
  it("moves an item into the box it is dropped on", () => {
    expect(resolveDrop({ kind: "item", id: "loose" }, { to: "box", boxId: "vinyl" }, state(null))).toEqual({ boxId: "vinyl" })
  })

  it("moves an item to the root from a breadcrumb", () => {
    expect(resolveDrop({ kind: "item", id: "unbuilt" }, { to: "box", boxId: null }, state("backlog"))).toEqual({ boxId: null })
  })

  it("resolves the parent zone to the open box's parent", () => {
    expect(resolveDrop({ kind: "item", id: "buried" }, { to: "parent" }, state("deep"))).toEqual({ boxId: "backlog" })
    expect(resolveDrop({ kind: "item", id: "kit" }, { to: "parent" }, state("mecha"))).toEqual({ boxId: null })
    expect(resolveDrop({ kind: "box", id: "deep" }, { to: "parent" }, state("backlog"))).toEqual({ boxId: "mecha" })
  })

  it("does nothing when the thing is already there", () => {
    expect(resolveDrop({ kind: "item", id: "kit" }, { to: "box", boxId: "mecha" }, state(null))).toBeNull()
    expect(resolveDrop({ kind: "item", id: "loose" }, { to: "box", boxId: null }, state(null))).toBeNull()
    expect(resolveDrop({ kind: "box", id: "backlog" }, { to: "box", boxId: "mecha" }, state("mecha"))).toBeNull()
    expect(resolveDrop({ kind: "box", id: "vinyl" }, { to: "box", boxId: null }, state(null))).toBeNull()
  })

  it("will not put a box inside itself or one of its descendants", () => {
    expect(resolveDrop({ kind: "box", id: "mecha" }, { to: "box", boxId: "mecha" }, state(null))).toBeNull()
    expect(resolveDrop({ kind: "box", id: "mecha" }, { to: "box", boxId: "backlog" }, state(null))).toBeNull()
    expect(resolveDrop({ kind: "box", id: "mecha" }, { to: "box", boxId: "deep" }, state(null))).toBeNull()
  })

  it("moves a box into an unrelated box or out to the root", () => {
    expect(resolveDrop({ kind: "box", id: "vinyl" }, { to: "box", boxId: "deep" }, state(null))).toEqual({ boxId: "deep" })
    expect(resolveDrop({ kind: "box", id: "backlog" }, { to: "box", boxId: null }, state("mecha"))).toEqual({ boxId: null })
  })

  it("ignores a drag of something that no longer exists", () => {
    expect(resolveDrop({ kind: "item", id: "gone" }, { to: "box", boxId: "vinyl" }, state(null))).toBeNull()
    expect(resolveDrop({ kind: "box", id: "gone" }, { to: "box", boxId: "vinyl" }, state(null))).toBeNull()
  })
})
