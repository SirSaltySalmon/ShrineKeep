import { describe, expect, it } from "vitest"
import { isBoxDragId, isBoxDropBlocked, shouldCueBoxDrop } from "./dashboard-drop-targets"

describe("isBoxDragId", () => {
  it("tells box drags from item drags", () => {
    expect(isBoxDragId("box-drag-1")).toBe(true)
    expect(isBoxDragId("item-1")).toBe(false)
    expect(isBoxDragId(null)).toBe(false)
  })
})

describe("isBoxDropBlocked", () => {
  it("blocks nothing while idle", () => {
    expect(isBoxDropBlocked(null, "1", true)).toBe(false)
  })

  it("blocks the box that is being dragged", () => {
    expect(isBoxDropBlocked("box-drag-1", "1", false)).toBe(true)
    expect(isBoxDropBlocked("box-drag-1", "2", false)).toBe(false)
    // A box id that merely starts with the dragged id is a different box.
    expect(isBoxDropBlocked("box-drag-1", "10", false)).toBe(false)
  })

  it("blocks selected boxes only while boxes are being moved", () => {
    expect(isBoxDropBlocked("box-drag-1", "2", true)).toBe(true)
    expect(isBoxDropBlocked("item-9", "2", true)).toBe(false)
  })
})

describe("shouldCueBoxDrop", () => {
  it("shows no cue while idle", () => {
    expect(shouldCueBoxDrop(null, "1", false)).toBe(false)
  })

  it("cues every box for an item drag, selected or not", () => {
    expect(shouldCueBoxDrop("item-9", "1", false)).toBe(true)
    expect(shouldCueBoxDrop("item-9", "1", true)).toBe(true)
  })

  it("skips the dragged box and the rest of a dragged selection", () => {
    expect(shouldCueBoxDrop("box-drag-1", "1", true)).toBe(false)
    expect(shouldCueBoxDrop("box-drag-1", "2", true)).toBe(false)
    expect(shouldCueBoxDrop("box-drag-1", "3", false)).toBe(true)
  })
})
