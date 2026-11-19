import { describe, expect, it } from "vitest"
import { KEEPERS } from "./keeper"
import { EMPTY_STATE_KEEPER_IDS, getEmptyStateKeeper, type EmptyStateFigure } from "./empty-state"

describe("empty-state keepers", () => {
  const figures = Object.keys(EMPTY_STATE_KEEPER_IDS) as EmptyStateFigure[]

  it("maps every place to a Keeper that exists", () => {
    const ids = KEEPERS.map((keeper) => keeper.id)
    for (const figure of figures) {
      expect(ids).toContain(EMPTY_STATE_KEEPER_IDS[figure])
      expect(getEmptyStateKeeper(figure).id).toBe(EMPTY_STATE_KEEPER_IDS[figure])
    }
  })

  it("uses the sleepy face for boxes and a wink for 404", () => {
    expect(getEmptyStateKeeper("boxes").face).toBe("sleepy")
    expect(getEmptyStateKeeper("notFound").face).toBe("wink")
  })
})
