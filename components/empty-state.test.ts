import { describe, expect, it } from "vitest"
import { KEEPERS } from "./keeper"
import { drawEmptyStateKeeper } from "./empty-state"
import { FIGURES, oddsSentence } from "@/lib/landing/blind-box"

describe("drawEmptyStateKeeper", () => {
  const total = KEEPERS.reduce((sum, keeper) => sum + keeper.weight, 0)

  it("draws at the blind-box game's pull odds", () => {
    // The game's figures carry the same weights, so its odds line describes this draw too.
    expect(FIGURES.map((figure) => figure.weight)).toEqual(KEEPERS.map((keeper) => keeper.weight))
    expect(oddsSentence()).toBe(oddsSentence(KEEPERS))
  })

  it("covers every Keeper, each over a slice of rolls the size of its weight", () => {
    let start = 0
    for (const keeper of KEEPERS) {
      const share = keeper.weight / total
      expect(drawEmptyStateKeeper(start + share * 0.001).id).toBe(keeper.id)
      expect(drawEmptyStateKeeper(start + share * 0.999).id).toBe(keeper.id)
      start += share
    }
  })

  it("makes the secret Keeper the rarest draw", () => {
    const rarest = [...KEEPERS].sort((a, b) => a.weight - b.weight)[0]
    expect(rarest.rarity).toBe("secret")
    expect(drawEmptyStateKeeper(0.9999).id).toBe(rarest.id)
  })
})
