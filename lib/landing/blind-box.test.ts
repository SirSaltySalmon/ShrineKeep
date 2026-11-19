import { describe, expect, it } from "vitest"
import { KEEPERS } from "@/components/keeper"
import {
  bestPulls,
  FIGURES,
  gameStatus,
  NEW_GAME,
  oddsSentence,
  PULL_COST,
  pullFigure,
  START_WALLET,
  TRADE_COST,
  tradeSpares,
  weightedPick,
  type GameState,
} from "./blind-box"

const ONE_OF_EACH = Object.fromEntries(FIGURES.map((figure) => [figure.id, 1]))
const copies = (state: GameState) => Object.values(state.owned).reduce((sum, n) => sum + n, 0)

function game(overrides: Partial<GameState>): GameState {
  return { ...NEW_GAME, ...overrides }
}

/** Everything but Gilt, the last figure in the table, so a roll just under 1 completes the set. */
function missingOnlyGilt(extra: Record<string, number> = {}): Record<string, number> {
  const rest = Object.fromEntries(FIGURES.filter((figure) => figure.id !== "gilt").map((figure) => [figure.id, 1]))
  return { ...rest, ...extra }
}

describe("figures", () => {
  it("gives every Keeper a value and a pull weight", () => {
    expect(FIGURES.map((figure) => figure.id)).toEqual(KEEPERS.map((keeper) => keeper.id))
    for (const figure of FIGURES) {
      expect(figure.value).toBeGreaterThan(0)
      expect(figure.weight).toBeGreaterThan(0)
    }
  })
})

describe("weightedPick", () => {
  const a = { id: "a", weight: 1 }
  const b = { id: "b", weight: 1 }
  const c = { id: "c", weight: 2 }
  const all = [a, b, c]

  it("starts at the first candidate", () => {
    expect(weightedPick(all, 0)).toBe(a)
    expect(weightedPick(all, 0.2499)).toBe(a)
  })

  it("moves on exactly at each weight boundary", () => {
    expect(weightedPick(all, 0.25)).toBe(b)
    expect(weightedPick(all, 0.4999)).toBe(b)
    expect(weightedPick(all, 0.5)).toBe(c)
  })

  it("ends at the last candidate just under the total", () => {
    expect(weightedPick(all, 0.999999)).toBe(c)
  })

  it("returns undefined for an empty list", () => {
    expect(weightedPick([], 0.5)).toBeUndefined()
  })

  it("picks in proportion to weight", () => {
    const hits = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 1000; i++) hits[weightedPick(all, i / 1000)!.id as keyof typeof hits] += 1
    expect(hits).toEqual({ a: 250, b: 250, c: 500 })
  })
})

describe("pullFigure", () => {
  it("pays for the pull and adds the figure", () => {
    const draw = pullFigure(NEW_GAME, 0)!
    expect(draw.figure.id).toBe(FIGURES[0].id)
    expect(draw.isNew).toBe(true)
    expect(draw.source).toBe("pull")
    expect(draw.next).toEqual({ owned: { [FIGURES[0].id]: 1 }, wallet: START_WALLET - PULL_COST, pulls: 1 })
    expect(NEW_GAME).toEqual({ owned: {}, wallet: START_WALLET, pulls: 0 })
  })

  it("marks a repeat as a spare", () => {
    const first = pullFigure(NEW_GAME, 0)!
    const second = pullFigure(first.next, 0)!
    expect(second.isNew).toBe(false)
    expect(second.next.owned[FIGURES[0].id]).toBe(2)
  })

  it("refuses when the wallet is short or the set is complete", () => {
    expect(pullFigure(game({ wallet: PULL_COST - 1 }), 0)).toBeNull()
    expect(pullFigure(game({ owned: ONE_OF_EACH }), 0)).toBeNull()
  })

  it("never takes the wallet below zero", () => {
    let state = NEW_GAME
    let pulls = 0
    for (let i = 0; i < 100; i++) {
      // Always the same figure, so the set never completes and only the wallet can stop it.
      const draw = pullFigure(state, 0)
      if (!draw) break
      state = draw.next
      pulls += 1
      expect(state.wallet).toBeGreaterThanOrEqual(0)
    }
    expect(pulls).toBe(15)
    expect(state.wallet).toBe(START_WALLET - 15 * PULL_COST)
    expect(gameStatus(state).canPull).toBe(false)
  })
})

describe("tradeSpares", () => {
  const start = game({ owned: { moss: 3, ember: 2, tide: 1, gilt: 2 }, wallet: 40, pulls: 10 })

  it("gives up exactly three spares, cheapest first, and never a last copy", () => {
    const draw = tradeSpares(start, 0)!
    const { [draw.figure.id]: granted, ...kept } = draw.next.owned
    expect(granted).toBe(1)
    // Moss and Ember are the cheapest; Gilt's spare is the dearest and survives.
    expect(kept).toEqual({ moss: 1, ember: 1, tide: 1, gilt: 2 })
    expect(copies(draw.next)).toBe(copies(start) - TRADE_COST + 1)
    expect(Object.values(draw.next.owned).every((n) => n >= 1)).toBe(true)
  })

  it("costs no money and no pull", () => {
    const draw = tradeSpares(start, 0)!
    expect(draw.next.wallet).toBe(start.wallet)
    expect(draw.next.pulls).toBe(start.pulls)
    expect(draw.source).toBe("trade")
    expect(draw.isNew).toBe(true)
    expect(start.owned).toEqual({ moss: 3, ember: 2, tide: 1, gilt: 2 })
  })

  it("only ever grants a figure the set is missing", () => {
    for (let i = 0; i < 100; i++) {
      const draw = tradeSpares(start, i / 100)!
      expect(start.owned[draw.figure.id]).toBeUndefined()
    }
  })

  it("refuses without enough spares or with a complete set", () => {
    expect(tradeSpares(game({ owned: { moss: 3 } }), 0)).toBeNull()
    expect(tradeSpares(game({ owned: { ...ONE_OF_EACH, moss: 4 } }), 0)).toBeNull()
  })
})

describe("gameStatus", () => {
  it("counts the set, the spares and the money", () => {
    const status = gameStatus(game({ owned: { moss: 3, gilt: 1 }, wallet: 88, pulls: 4 }))
    expect(status.unique).toBe(2)
    expect(status.spares).toBe(2)
    expect(status.complete).toBe(false)
    expect(status.value).toBe(3 * 6 + 120)
    expect(status.spent).toBe(4 * PULL_COST)
    expect(status.profit).toBe(status.value - status.spent)
  })

  it("allows a pull only while the wallet covers one", () => {
    expect(gameStatus(game({ wallet: PULL_COST })).canPull).toBe(true)
    expect(gameStatus(game({ wallet: PULL_COST - 1 })).canPull).toBe(false)
  })

  it("is broke only when the wallet is short and there are too few spares to trade", () => {
    const short = PULL_COST - 1
    expect(gameStatus(game({ wallet: short, owned: { moss: TRADE_COST } })).broke).toBe(true)
    expect(gameStatus(game({ wallet: short, owned: { moss: TRADE_COST + 1 } })).broke).toBe(false)
    expect(gameStatus(game({ wallet: short, owned: { moss: TRADE_COST + 1 } })).canTrade).toBe(true)
    expect(gameStatus(game({ wallet: PULL_COST, owned: {} })).broke).toBe(false)
  })

  it("ends the game on a complete set", () => {
    const status = gameStatus(game({ owned: { ...ONE_OF_EACH, moss: 5 }, wallet: 0 }))
    expect(status.complete).toBe(true)
    expect(status.canPull).toBe(false)
    expect(status.canTrade).toBe(false)
    expect(status.broke).toBe(false)
  })
})

describe("bestPulls", () => {
  it("keeps the best while the set is incomplete", () => {
    expect(bestPulls(null, NEW_GAME)).toBeNull()
    expect(bestPulls(12, NEW_GAME)).toBe(12)
  })

  it("records the lower count when a pull completes the set", () => {
    const draw = pullFigure(game({ owned: missingOnlyGilt(), wallet: 16, pulls: 13 }), 0.999999)!
    expect(gameStatus(draw.next).complete).toBe(true)
    expect(bestPulls(null, draw.next)).toBe(14)
    expect(bestPulls(20, draw.next)).toBe(14)
    expect(bestPulls(9, draw.next)).toBe(9)
  })

  it("records the lower count when a trade completes the set", () => {
    const draw = tradeSpares(game({ owned: missingOnlyGilt({ moss: 4 }), wallet: 0, pulls: 15 }), 0)!
    expect(draw.figure.id).toBe("gilt")
    expect(gameStatus(draw.next).complete).toBe(true)
    expect(bestPulls(null, draw.next)).toBe(15)
    expect(bestPulls(20, draw.next)).toBe(15)
    expect(bestPulls(9, draw.next)).toBe(9)
  })
})

describe("oddsSentence", () => {
  it("reads as it always has for the current weights", () => {
    expect(oddsSentence()).toBe("Odds per pull: commons 15% each, rares 6.5% each, the secret 5.5%.")
  })

  it("states weight / total for every figure", () => {
    const total = FIGURES.reduce((sum, figure) => sum + figure.weight, 0)
    const sentence = oddsSentence()
    for (const figure of FIGURES) {
      expect(sentence).toContain(`${Math.round((figure.weight / total) * 1000) / 10}%`)
    }
  })

  it("follows the weights it is given", () => {
    expect(
      oddsSentence([
        { rarity: "common", weight: 3 },
        { rarity: "common", weight: 3 },
        { rarity: "secret", weight: 2 },
      ])
    ).toBe("Odds per pull: commons 37.5% each, the secret 25%.")
    expect(
      oddsSentence([
        { rarity: "common", weight: 6 },
        { rarity: "rare", weight: 1 },
        { rarity: "rare", weight: 3 },
      ])
    ).toBe("Odds per pull: the common 60%, rares 10% to 30% each.")
  })
})
