import { KEEPERS, RARITY_LABEL, type KeeperRarity, type KeeperSpec } from "@/components/keeper"
import { weightedPick } from "@/lib/weighted-pick"

export { weightedPick }

/**
 * Rules of the landing page's blind-box game (`components/landing/blind-box-game.tsx`).
 * Pure: randomness comes in as a `roll`, a uniform sample in [0, 1).
 */

export const START_WALLET = 120
export const PULL_COST = 8
/** Spares given up for one trade. */
export const TRADE_COST = 3

/**
 * Game-only mock resale value in dollars, per Keeper id. It lives here, not on `KEEPERS`,
 * because the product has no use for it. Pull odds are `KeeperSpec.weight`, shared with
 * the empty states.
 */
const FIGURE_VALUE: Record<string, number> = {
  moss: 6,
  ember: 6,
  tide: 7,
  plum: 7,
  dusk: 8,
  oni: 18,
  saint: 22,
  ink: 25,
  gilt: 120,
}

export interface GameFigure extends KeeperSpec {
  value: number
}

export const FIGURES: GameFigure[] = KEEPERS.map((keeper) => ({ ...keeper, value: FIGURE_VALUE[keeper.id] }))

export interface GameState {
  /** Copies held, by figure id. */
  owned: Record<string, number>
  wallet: number
  pulls: number
}

export const NEW_GAME: GameState = { owned: {}, wallet: START_WALLET, pulls: 0 }

/** What one pull or trade produced, and the game after it. */
export interface Draw {
  figure: GameFigure
  isNew: boolean
  source: "pull" | "trade"
  next: GameState
}

const count = (state: GameState, figure: GameFigure) => state.owned[figure.id] ?? 0

export function gameStatus(state: GameState) {
  const unique = FIGURES.filter((figure) => count(state, figure) > 0).length
  const spares = FIGURES.reduce((sum, figure) => sum + Math.max(0, count(state, figure) - 1), 0)
  const complete = unique === FIGURES.length
  const value = FIGURES.reduce((sum, figure) => sum + count(state, figure) * figure.value, 0)
  const spent = state.pulls * PULL_COST
  return {
    unique,
    spares,
    complete,
    canPull: !complete && state.wallet >= PULL_COST,
    canTrade: !complete && spares >= TRADE_COST,
    /** Out of moves: cannot afford a pull and cannot make a trade. */
    broke: !complete && state.wallet < PULL_COST && spares < TRADE_COST,
    value,
    spent,
    profit: value - spent,
  }
}

/** Pays for one pull and adds the figure it draws. `null` when a pull is not allowed. */
export function pullFigure(state: GameState, roll: number): Draw | null {
  if (!gameStatus(state).canPull) return null
  const figure = weightedPick(FIGURES, roll)
  if (!figure) return null
  return {
    figure,
    isNew: count(state, figure) === 0,
    source: "pull",
    next: {
      owned: { ...state.owned, [figure.id]: count(state, figure) + 1 },
      wallet: state.wallet - PULL_COST,
      pulls: state.pulls + 1,
    },
  }
}

/** Swaps `TRADE_COST` spares for a figure the set is missing. `null` when a trade is not allowed. */
export function tradeSpares(state: GameState, roll: number): Draw | null {
  if (!gameStatus(state).canTrade) return null
  const owned = { ...state.owned }
  let toGive = TRADE_COST
  // Give up the cheapest spares first, and never the last copy of anything.
  for (const figure of [...FIGURES].sort((a, b) => a.value - b.value)) {
    while (toGive > 0 && (owned[figure.id] ?? 0) > 1) {
      owned[figure.id] -= 1
      toGive -= 1
    }
  }
  const missing = FIGURES.filter((candidate) => !owned[candidate.id])
  const figure = weightedPick(missing, roll)
  if (!figure) return null
  owned[figure.id] = 1
  return { figure, isNew: true, source: "trade", next: { ...state, owned } }
}

/** The fewest pulls a full set has taken: `best` so far, or this game's count if it just did better. */
export function bestPulls(best: number | null, state: GameState): number | null {
  if (!gameStatus(state).complete) return best
  return best === null ? state.pulls : Math.min(best, state.pulls)
}

const percent = (weight: number, total: number) => Math.round((weight / total) * 1000) / 10

/** The odds line under the game, written from the weights so it cannot drift from them. */
export function oddsSentence(figures: Pick<GameFigure, "rarity" | "weight">[] = FIGURES): string {
  const total = figures.reduce((sum, figure) => sum + figure.weight, 0)
  const parts = (Object.keys(RARITY_LABEL) as KeeperRarity[]).flatMap((rarity) => {
    const group = figures.filter((figure) => figure.rarity === rarity)
    if (group.length === 0) return []
    const odds = group.map((figure) => percent(figure.weight, total))
    const low = Math.min(...odds)
    const high = Math.max(...odds)
    const range = low === high ? `${low}%` : `${low}% to ${high}%`
    const noun = RARITY_LABEL[rarity].toLowerCase()
    return group.length === 1 ? `the ${noun} ${range}` : `${noun}s ${range} each`
  })
  return `Odds per pull: ${parts.join(", ")}.`
}
