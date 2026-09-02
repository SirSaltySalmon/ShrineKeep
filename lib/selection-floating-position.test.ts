import { describe, expect, it } from "vitest"
import { selectionFloatingBottomOffset } from "./selection-floating-position"

describe("selection floating UI positioning", () => {
  it("uses the normal dashboard gutter without the action bar", () => {
    expect(selectionFloatingBottomOffset(false)).toBe(24)
  })

  it("uses the shared action-bar offset when selection UI is visible", () => {
    expect(selectionFloatingBottomOffset(true)).toBe(72)
  })
})
