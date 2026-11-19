import { describe, expect, it } from "vitest"
import {
  BOX_DRAG_ID_PREFIX,
  BOX_DROP_ID_PREFIX,
  BREADCRUMB_BOX_DROP_ID_PREFIX,
  ITEM_DRAG_ID_PREFIX,
  getDropTargetBoxId,
  isBoxDragId,
  isBoxDropBlocked,
  shouldCueBoxDrop,
} from "./dashboard-drop-targets"

describe("isBoxDragId", () => {
  it("tells box drags from item drags", () => {
    expect(isBoxDragId("box-drag-1")).toBe(true)
    expect(isBoxDragId("item-1")).toBe(false)
    expect(isBoxDragId(null)).toBe(false)
  })
})

describe("getDropTargetBoxId", () => {
  it("reads the box from a box card or a breadcrumb", () => {
    expect(getDropTargetBoxId(BOX_DROP_ID_PREFIX + "1")).toBe("1")
    expect(getDropTargetBoxId(BREADCRUMB_BOX_DROP_ID_PREFIX + "1")).toBe("1")
  })

  it("is undefined for the droppables that are not one box", () => {
    expect(getDropTargetBoxId("breadcrumb-root")).toBeUndefined()
    expect(getDropTargetBoxId("drop-zone-parent")).toBeUndefined()
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

describe("drop cue and drop decision", () => {
  // `handleDragEnd` refuses a drop with `isBoxDropBlocked`; the cards and crumbs draw the cue
  // with `shouldCueBoxDrop`. Whatever is being dragged, a box shows the cue exactly when it accepts.
  it("agree for every drag, box and selection state", () => {
    const drags = [ITEM_DRAG_ID_PREFIX + "1", BOX_DRAG_ID_PREFIX + "1", BOX_DRAG_ID_PREFIX + "2"]
    for (const drag of drags) {
      for (const boxId of ["1", "2", "3"]) {
        for (const selected of [false, true]) {
          expect(shouldCueBoxDrop(drag, boxId, selected)).toBe(!isBoxDropBlocked(drag, boxId, selected))
        }
      }
    }
  })
})
