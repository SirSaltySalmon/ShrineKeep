"use client"

import * as React from "react"
import Link from "next/link"
import { Repeat, RotateCcw } from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Keeper, KEEPERS, RARITY_LABEL, type KeeperSpec } from "@/components/landing/keeper"

/**
 * Landing mini-game: complete the nine-figure set before the wallet runs out.
 * Pretend money only. It exists to make value / acquisition / completion
 * (the three numbers ShrineKeep tracks) something a visitor feels in 30 seconds.
 */

const START_WALLET = 120
const PULL_COST = 8
const TRADE_COST = 3
const CRANK_MS = 750
const BEST_KEY = "sk-landing-blindbox-best"

const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace"
const BEBAS = "var(--font-bebas-neue), sans-serif"

type Owned = Record<string, number>
type Phase = "idle" | "cranking" | "reveal"

interface Reveal {
  spec: KeeperSpec
  isNew: boolean
  source: "pull" | "trade"
}

function weightedPick(candidates: KeeperSpec[]): KeeperSpec {
  const total = candidates.reduce((sum, k) => sum + k.weight, 0)
  let roll = Math.random() * total
  for (const k of candidates) {
    roll -= k.weight
    if (roll < 0) return k
  }
  return candidates[candidates.length - 1]
}

const uniqueCount = (owned: Owned) => KEEPERS.filter((k) => (owned[k.id] ?? 0) > 0).length
const dupeCount = (owned: Owned) => KEEPERS.reduce((sum, k) => sum + Math.max(0, (owned[k.id] ?? 0) - 1), 0)

// Decorative capsules inside the dome. Fixed positions keep server and client markup identical.
const DOME_CAPSULES = [
  { left: "6%", top: "52%", rot: -20, color: "tag-blue" },
  { left: "24%", top: "60%", rot: 35, color: "tag-yellow" },
  { left: "44%", top: "56%", rot: -8, color: "tag-green" },
  { left: "64%", top: "61%", rot: 50, color: "tag-violet" },
  { left: "80%", top: "52%", rot: -40, color: "tag-orange" },
  { left: "15%", top: "30%", rot: 70, color: "tag-indigo" },
  { left: "35%", top: "33%", rot: -55, color: "tag-red" },
  { left: "55%", top: "29%", rot: 15, color: "tag-blue" },
  { left: "73%", top: "31%", rot: -75, color: "tag-green" },
  { left: "27%", top: "8%", rot: 25, color: "tag-orange" },
  { left: "48%", top: "5%", rot: -30, color: "tag-yellow" },
  { left: "63%", top: "10%", rot: 60, color: "tag-violet" },
]

export function BlindBoxGame() {
  const [owned, setOwned] = React.useState<Owned>({})
  const [wallet, setWallet] = React.useState(START_WALLET)
  const [pulls, setPulls] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [last, setLast] = React.useState<Reveal | null>(null)
  const [best, setBest] = React.useState<number | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(BEST_KEY))
      if (Number.isFinite(stored) && stored > 0) setBest(stored)
    } catch {
      // Private mode or blocked storage: the game works without a saved best.
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const unique = uniqueCount(owned)
  const dupes = dupeCount(owned)
  const complete = unique === KEEPERS.length
  const busy = phase === "cranking"
  const canPull = !busy && !complete && wallet >= PULL_COST
  const canTrade = !busy && !complete && dupes >= TRADE_COST
  const broke = !busy && !complete && wallet < PULL_COST && dupes < TRADE_COST
  const value = KEEPERS.reduce((sum, k) => sum + (owned[k.id] ?? 0) * k.value, 0)
  const spent = pulls * PULL_COST
  const profit = value - spent

  const recordBest = (finalPulls: number) => {
    setBest((current) => {
      const next = current === null ? finalPulls : Math.min(current, finalPulls)
      try {
        window.localStorage.setItem(BEST_KEY, String(next))
      } catch {
        // Ignore: see above.
      }
      return next
    })
  }

  const pull = () => {
    if (!canPull) return
    const spec = weightedPick(KEEPERS)
    const nextOwned = { ...owned, [spec.id]: (owned[spec.id] ?? 0) + 1 }
    const nextPulls = pulls + 1
    const reveal: Reveal = { spec, isNew: !owned[spec.id], source: "pull" }

    setWallet(wallet - PULL_COST)
    setPulls(nextPulls)
    setPhase("cranking")

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    timer.current = setTimeout(
      () => {
        setOwned(nextOwned)
        setLast(reveal)
        setPhase("reveal")
        if (uniqueCount(nextOwned) === KEEPERS.length) recordBest(nextPulls)
      },
      reduced ? 0 : CRANK_MS
    )
  }

  const trade = () => {
    if (!canTrade) return
    const nextOwned = { ...owned }
    let toRemove = TRADE_COST
    // Give up the cheapest spares first.
    for (const k of [...KEEPERS].sort((a, b) => a.value - b.value)) {
      while (toRemove > 0 && (nextOwned[k.id] ?? 0) > 1) {
        nextOwned[k.id] -= 1
        toRemove -= 1
      }
    }
    const spec = weightedPick(KEEPERS.filter((k) => !nextOwned[k.id]))
    nextOwned[spec.id] = 1
    setOwned(nextOwned)
    setLast({ spec, isNew: true, source: "trade" })
    setPhase("reveal")
    if (uniqueCount(nextOwned) === KEEPERS.length) recordBest(pulls)
  }

  const reset = () => {
    if (timer.current) clearTimeout(timer.current)
    setOwned({})
    setWallet(START_WALLET)
    setPulls(0)
    setPhase("idle")
    setLast(null)
  }

  let message = `Nine figures. ${formatCurrency(START_WALLET)} of pretend money. Complete the set before the wallet gives out.`
  if (busy) message = "Clunk. Clunk. Clunk."
  else if (complete) message = `Set complete in ${pulls} pulls with $${wallet} to spare.`
  else if (broke) message = `Wallet's empty at ${unique} of ${KEEPERS.length}. That's the hobby.`
  else if (last?.source === "trade") message = `Traded ${TRADE_COST} spares for ${last.spec.name}. Somebody out there is happy too.`
  else if (last?.isNew) message = `New: ${last.spec.name}. ${RARITY_LABEL[last.spec.rarity]}, worth about $${last.spec.value}.`
  else if (last) message = `Another ${last.spec.name}. That's a spare.`

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:items-start lg:gap-12">
      {/* The machine */}
      <div className="mx-auto w-full max-w-[19rem]">
        <div className="relative h-44 overflow-hidden rounded-t-[2.75rem] border-2 border-foreground bg-background">
          <div className={cn("absolute inset-0", busy && "sk-landing-jiggle")} aria-hidden>
            {DOME_CAPSULES.map((c, i) => (
              <span
                key={i}
                className="absolute h-11 w-11 rounded-full border-2 border-foreground"
                style={{
                  left: c.left,
                  top: c.top,
                  transform: `rotate(${c.rot}deg)`,
                  background: `linear-gradient(hsl(var(--${c.color})) 50%, hsl(var(--card)) 50%)`,
                }}
              />
            ))}
          </div>
          <span className="pointer-events-none absolute left-5 top-4 h-16 w-3 rotate-12 rounded-full bg-background/70" aria-hidden />
        </div>

        <div
          className="rounded-b-lg border-2 border-t-0 border-foreground p-4 shadow-[6px_6px_0_0_hsl(var(--foreground))]"
          style={{ background: "hsl(var(--tag-red))" }}
        >
          <div className="flex items-end justify-between gap-2" style={{ color: "hsl(var(--tag-foreground))" }}>
            <p className="text-4xl leading-[0.85] tracking-wide" style={{ fontFamily: BEBAS }}>
              Blind
              <br />
              Box
            </p>
            <p className="text-right text-[11px] font-semibold uppercase leading-tight tracking-wider" style={{ fontFamily: MONO }}>
              Series 01
              <br />${PULL_COST} a pull
            </p>
          </div>

          <div className="mt-4 flex items-stretch gap-3">
            <button
              type="button"
              onClick={pull}
              disabled={!canPull}
              aria-label={`Turn the crank: pull one figure for $${PULL_COST}`}
              className="group relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span key={pulls} className={cn("flex h-full w-full items-center justify-center", busy && "sk-landing-crank")} aria-hidden>
                <span className="h-5 w-[4.5rem] rounded-full border-2 border-foreground bg-foreground" />
                <span className="absolute h-7 w-7 rounded-full border-2 border-foreground bg-background" />
              </span>
            </button>

            <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border-2 border-foreground bg-background">
              {phase === "reveal" && last ? (
                <div key={`${last.spec.id}-${pulls}-${unique}`} className="sk-landing-pop flex flex-col items-center py-1">
                  <Keeper spec={last.spec} className="h-16 w-auto" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground" style={{ fontFamily: MONO }}>
                    {last.isNew ? "New!" : "Spare"}
                  </span>
                </div>
              ) : (
                <span className="px-2 text-center text-[11px] uppercase leading-tight tracking-wider text-muted-foreground" style={{ fontFamily: MONO }}>
                  {busy ? "..." : "Turn the crank"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mx-6 flex justify-between" aria-hidden>
          <span className="h-3 w-8 rounded-b-md border-2 border-t-0 border-foreground bg-foreground" />
          <span className="h-3 w-8 rounded-b-md border-2 border-t-0 border-foreground bg-foreground" />
        </div>
      </div>

      {/* The shelf + ledger */}
      <div className="min-w-0">
        <dl className="grid grid-cols-3 divide-x-2 divide-foreground rounded-lg border-2 border-foreground bg-background text-center" style={{ fontFamily: MONO }}>
          {[
            { label: "Wallet", value: `$${wallet}` },
            { label: "Pulls", value: String(pulls) },
            { label: "Set", value: `${unique}/${KEEPERS.length}` },
          ].map((stat) => (
            <div key={stat.label} className="px-2 py-2">
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{stat.label}</dt>
              <dd className="text-fluid-2xl font-semibold leading-tight text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 min-h-[2.75rem] text-fluid-base font-medium text-foreground" aria-live="polite">
          {message}
        </p>

        <ul className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
          {KEEPERS.map((spec) => {
            const count = owned[spec.id] ?? 0
            const have = count > 0
            const fresh = phase === "reveal" && last?.spec.id === spec.id
            return (
              <li
                key={spec.id}
                className={cn(
                  "relative flex flex-col items-center rounded-lg border-2 bg-background px-1 pb-2 pt-3 transition-colors",
                  have ? "border-foreground" : "border-dashed border-border",
                  fresh && "shadow-[4px_4px_0_0_hsl(var(--foreground))]"
                )}
              >
                <Keeper
                  spec={spec}
                  silhouette={!have}
                  className={cn("h-14 w-auto sm:h-[4.5rem]", fresh && "sk-landing-pop")}
                  key={fresh ? `${spec.id}-${count}` : spec.id}
                />
                <span className="mt-1 text-fluid-sm font-semibold text-foreground">{have ? spec.name : "???"}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: MONO }}>
                  {RARITY_LABEL[spec.rarity]}
                </span>
                {count > 1 && (
                  <span
                    className="absolute right-1.5 top-1.5 rounded-md border-2 border-foreground px-1 text-[10px] font-semibold leading-4 text-foreground"
                    style={{ fontFamily: MONO, background: "hsl(var(--tag-yellow))" }}
                  >
                    ×{count}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {complete || broke ? (
            <>
              <Button onClick={reset} className="border-2 border-foreground">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Play again
              </Button>
              <Button asChild variant="outline" className="border-2 border-foreground">
                <Link href="/judge">Track the real ones</Link>
              </Button>
            </>
          ) : (
            <>
              <Button onClick={pull} disabled={!canPull} className="border-2 border-foreground">
                Pull one · ${PULL_COST}
              </Button>
              <Button onClick={trade} disabled={!canTrade} variant="outline" className="border-2 border-foreground">
                <Repeat className="mr-2 h-4 w-4" aria-hidden />
                Trade {TRADE_COST} spares ({dupes})
              </Button>
              {pulls > 0 && (
                <Button onClick={reset} variant="ghost" size="sm">
                  Start over
                </Button>
              )}
            </>
          )}
        </div>

        {/* The same three numbers the dashboard keeps for a real collection. */}
        <div className="mt-5 rounded-lg border-2 border-foreground bg-background p-3">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-fluid-sm text-muted-foreground">
              Value{" "}
              <strong className="text-fluid-xl font-semibold" style={{ color: "hsl(var(--value-color))" }}>
                {formatCurrency(value)}
              </strong>
            </span>
            <span className="text-fluid-sm text-muted-foreground">
              Acquisition{" "}
              <strong className="text-fluid-xl font-semibold" style={{ color: "hsl(var(--acquisition-color))" }}>
                {formatCurrency(spent)}
              </strong>
            </span>
            <span className="text-fluid-sm text-muted-foreground">
              Profit{" "}
              <strong className="text-fluid-xl font-semibold text-foreground">
                {profit >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(profit))}
              </strong>
            </span>
          </div>
          <p className="mt-1.5 text-fluid-xs text-muted-foreground">
            ShrineKeep keeps these three numbers for your actual collection, with a graph.
            {best !== null && ` Your best: full set in ${best} pulls.`}
          </p>
        </div>

        <p className="mt-3 text-fluid-xs text-muted-foreground" style={{ fontFamily: MONO }}>
          Odds per pull: commons 15% each, rares 6.5% each, the secret 5.5%. No real money, obviously.
        </p>
      </div>
    </div>
  )
}
