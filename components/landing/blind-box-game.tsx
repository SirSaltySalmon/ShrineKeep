"use client"

import * as React from "react"
import Link from "next/link"
import { Repeat, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Keeper, RARITY_LABEL } from "@/components/keeper"
import { MoneyStats } from "@/components/landing/money-stats"
import {
  bestPulls,
  FIGURES,
  gameStatus,
  NEW_GAME,
  oddsSentence,
  PULL_COST,
  pullFigure,
  TRADE_COST,
  tradeSpares,
  type Draw,
  type GameState,
} from "@/lib/landing/blind-box"
import { HARD_SHADOW, LANDING_FONT } from "@/lib/landing/tokens"

/**
 * Landing mini-game: complete the nine-figure set before the wallet runs out.
 * Pretend money only. It exists to make value / acquisition / completion
 * (the three numbers ShrineKeep tracks) something a visitor feels in 30 seconds.
 * The rules are in `lib/landing/blind-box.ts`; this file is the machine around them.
 */

const CRANK_MS = 750
const BEST_KEY = "sk-landing-blindbox-best"
const ODDS = oddsSentence()

/**
 * While the crank turns, the pull controls are `aria-disabled` rather than `disabled`: a focused
 * control that becomes `disabled` can lose focus, which would cost a re-focus on every pull.
 */
const BUSY_CLASS = "aria-disabled:pointer-events-none aria-disabled:opacity-50"

type Phase = "idle" | "cranking" | "reveal"

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
  const [game, setGame] = React.useState<GameState>(NEW_GAME)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [last, setLast] = React.useState<Draw | null>(null)
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

  const status = gameStatus(game)
  const { unique, spares, complete } = status
  const busy = phase === "cranking"
  const canTrade = !busy && status.canTrade
  // Mid-crank the money has moved but the figure has not dropped, so it is too early to call it.
  const broke = !busy && status.broke
  const over = complete || broke

  const recordBest = (finished: GameState) => {
    setBest((current) => {
      const next = bestPulls(current, finished)
      try {
        if (next !== null) window.localStorage.setItem(BEST_KEY, String(next))
      } catch {
        // Ignore: see above.
      }
      return next
    })
  }

  const land = (draw: Draw) => {
    setGame(draw.next)
    setLast(draw)
    setPhase("reveal")
    if (gameStatus(draw.next).complete) recordBest(draw.next)
  }

  const pull = () => {
    if (busy) return
    const draw = pullFigure(game, Math.random())
    if (!draw) return
    // The money moves as the crank starts; the figure drops when it stops.
    setGame({ ...draw.next, owned: game.owned })
    setPhase("cranking")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    timer.current = setTimeout(() => land(draw), reduced ? 0 : CRANK_MS)
  }

  const trade = () => {
    if (busy) return
    const draw = tradeSpares(game, Math.random())
    if (draw) land(draw)
  }

  const reset = () => {
    if (timer.current) clearTimeout(timer.current)
    setGame(NEW_GAME)
    setPhase("idle")
    setLast(null)
  }

  let message = `You know what to do.`
  if (last?.source === "trade") message = `Traded ${TRADE_COST} spares for ${last.figure.name}. Somebody out there is happy too.`
  else if (last?.isNew) message = `New: ${last.figure.name}. ${RARITY_LABEL[last.figure.rarity]}, worth about $${last.figure.value}.`
  else if (last) message = `Another ${last.figure.name}. That's a spare.`

  let endMessage: string | null = null
  if (complete) endMessage = `Set complete in ${game.pulls} pulls with $${game.wallet} to spare.`
  else if (broke) endMessage = `Wallet's empty at ${unique} of ${FIGURES.length}. Better luck next time!`

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
          className={`rounded-b-lg border-2 border-t-0 border-foreground p-4 ${HARD_SHADOW}`}
          style={{ background: "hsl(var(--tag-red))" }}
        >
          <div className="flex items-end justify-between gap-2" style={{ color: "hsl(var(--tag-foreground))" }}>
            <p className="text-4xl leading-[0.85] tracking-wide" style={{ fontFamily: LANDING_FONT.bebas }}>
              Blind
              <br />
              Box
            </p>
            {/* Ink, not the plate's white: at this size white on the red falls short of 4.5:1. */}
            <p
              className="text-right text-[11px] font-semibold uppercase leading-tight tracking-wider text-foreground"
              style={{ fontFamily: LANDING_FONT.mono }}
            >
              Series 01
              <br />${PULL_COST} a pull
            </p>
          </div>

          <div className="mt-4 flex items-stretch gap-3">
            <button
              type="button"
              onClick={pull}
              disabled={!status.canPull}
              aria-disabled={busy}
              aria-label={`Turn the crank: pull one figure for $${PULL_COST}`}
              className="group relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background transition-transform motion-safe:enabled:hover:scale-105 motion-safe:enabled:active:scale-95 disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span key={game.pulls} className={cn("flex h-full w-full items-center justify-center", busy && "sk-landing-crank")} aria-hidden>
                <span className="h-5 w-[4.5rem] rounded-full border-2 border-foreground bg-foreground" />
                <span className="absolute h-7 w-7 rounded-full border-2 border-foreground bg-background" />
              </span>
            </button>

            <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border-2 border-foreground bg-background">
              {phase === "reveal" && last ? (
                <div key={`${last.figure.id}-${game.pulls}-${unique}`} className="sk-landing-pop flex flex-col items-center py-1">
                  <Keeper spec={last.figure} className="h-16 w-auto" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground" style={{ fontFamily: LANDING_FONT.mono }}>
                    {last.isNew ? "New!" : "Spare"}
                  </span>
                </div>
              ) : (
                <span
                  className="px-2 text-center text-[11px] uppercase leading-tight tracking-wider text-muted-foreground"
                  style={{ fontFamily: LANDING_FONT.mono }}
                >
                  {busy ? "..." : "CRANK THAT"}
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
        <dl
          className="grid grid-cols-3 divide-x-2 divide-foreground rounded-lg border-2 border-foreground bg-background text-center"
          style={{ fontFamily: LANDING_FONT.mono }}
        >
          {[
            { label: "Wallet", value: `$${game.wallet}` },
            { label: "Pulls", value: String(game.pulls) },
            { label: "Set", value: `${unique}/${FIGURES.length}` },
          ].map((stat) => (
            <div key={stat.label} className="px-2 py-2">
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{stat.label}</dt>
              <dd className="text-fluid-2xl font-semibold leading-tight text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {/*
          The live text changes once per result. The crank's filler takes its place on screen but
          stays out of the live region, so a pull is not announced twice.
        */}
        <div className="mt-3 min-h-[2.75rem] text-fluid-base font-medium text-foreground">
          <p aria-live="polite" className={busy ? "sr-only" : undefined}>
            {/* Keyed by draw, so the same result twice in a row is still announced twice. */}
            <span key={last ? `${last.next.pulls}-${last.figure.id}` : "start"}>
              {endMessage ? (
                <>
                  {/* Sighted visitors see the last figure land; the end message alone would not say it. */}
                  <span className="sr-only">{message} </span>
                  {endMessage}
                </>
              ) : (
                message
              )}
            </span>
          </p>
          {busy && <p aria-hidden>Clunk clunk clunk...</p>}
        </div>

        <ul className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
          {FIGURES.map((figure) => {
            const count = game.owned[figure.id] ?? 0
            const have = count > 0
            const fresh = phase === "reveal" && last?.figure.id === figure.id
            return (
              <li
                key={figure.id}
                className={cn(
                  "relative flex flex-col items-center rounded-lg border-2 bg-background px-1 pb-2 pt-3 transition-colors",
                  have ? "border-foreground" : "border-dashed border-border",
                  fresh && "shadow-[4px_4px_0_0_hsl(var(--foreground))]"
                )}
              >
                <Keeper
                  spec={figure}
                  silhouette={!have}
                  className={cn("h-14 w-auto sm:h-[4.5rem]", fresh && "sk-landing-pop")}
                  key={fresh ? `${figure.id}-${count}` : figure.id}
                />
                <span className="mt-1 text-fluid-sm font-semibold text-foreground">{have ? figure.name : "???"}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: LANDING_FONT.mono }}>
                  {RARITY_LABEL[figure.rarity]}
                </span>
                {count > 1 && (
                  <span
                    className="absolute right-1.5 top-1.5 rounded-md border-2 border-foreground px-1 text-[10px] font-semibold leading-4 text-foreground"
                    style={{ fontFamily: LANDING_FONT.mono, background: "hsl(var(--tag-yellow))" }}
                  >
                    ×{count}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {/*
          Pull and trade keep their place when the game ends and the end actions are added after
          them, so a click meant for "Pull one" can never land on "Play again" or on a link.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            key="pull"
            onClick={pull}
            disabled={!status.canPull}
            aria-disabled={busy}
            className={cn("border-2 border-foreground", BUSY_CLASS)}
          >
            Pull one · ${PULL_COST}
          </Button>
          <Button onClick={trade} disabled={!canTrade} variant="outline" className="border-2 border-foreground">
            <Repeat className="mr-2 h-4 w-4" aria-hidden />
            Trade {TRADE_COST} spares ({spares})
          </Button>
          {over ? (
            <>
              <Button key="play-again" onClick={reset} className="border-2 border-foreground">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Play again
              </Button>
              <Button asChild variant="outline" className="border-2 border-foreground">
                <Link href="/judge">Track the real ones</Link>
              </Button>
            </>
          ) : (
            game.pulls > 0 && (
              <Button onClick={reset} variant="ghost" size="sm">
                Start over
              </Button>
            )
          )}
        </div>

        {/* The same three numbers the dashboard keeps for a real collection. */}
        <div className="mt-5 rounded-lg border-2 border-foreground bg-background p-3">
          <MoneyStats value={status.value} spent={status.spent} size="md" />
          {best !== null && <p className="mt-1.5 text-fluid-xs text-muted-foreground">Your best: full set in {best} pulls.</p>}
        </div>

        {/* Not muted: this line sits on the section's yellow tint, where muted text is under 4.5:1. */}
        <p className="mt-3 text-fluid-xs text-foreground/80" style={{ fontFamily: LANDING_FONT.mono }}>
          {ODDS}
        </p>
      </div>
    </div>
  )
}
