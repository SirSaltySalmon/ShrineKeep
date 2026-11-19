"use client"

import * as React from "react"
import { Shuffle, Sparkles, Wind } from "lucide-react"
import { cn } from "@/lib/utils"
import { SiteLogoMark } from "@/components/site-logo"
import { Keeper, KEEPERS } from "@/components/keeper"
import { DEFAULT_FONT_IDS, fontSizeCqw, LINES, mottoFont, pickFonts, WORD_GAP, WORDS } from "@/lib/landing/motto"
import { LANDING_FONT } from "@/lib/landing/tokens"

/**
 * The motto is the one fixed thing on this page: six words, six typefaces.
 * Words and shelf figures load scattered and snap into place, which is the pitch.
 * Sizes are in container-query units so the poster scales as one object; the fit table
 * that keeps its shape through a font shuffle is in `lib/landing/motto.ts`.
 */

const KEEPER_MESS = [
  "translate(4cqw, -22cqw) rotate(-38deg)",
  "translate(-6cqw, -9cqw) rotate(64deg)",
  "translate(10cqw, -31cqw) rotate(18deg)",
  "translate(-3cqw, -16cqw) rotate(-120deg)",
  "translate(2cqw, -39cqw) rotate(170deg)",
  "translate(-12cqw, -6cqw) rotate(-75deg)",
  "translate(6cqw, -27cqw) rotate(95deg)",
  "translate(-8cqw, -35cqw) rotate(-20deg)",
  "translate(3cqw, -12cqw) rotate(140deg)",
]

const LINE_ALIGN = ["justify-start", "justify-end", "justify-start"] as const

type Mode = "intro" | "messy" | "tidy"

/**
 * The settle after the intro. Which property transitions is a class, because only a class can be
 * switched off for `prefers-reduced-motion`; an inline `transition` cannot. Duration and easing
 * stay inline: with tailwindcss-animate installed, arbitrary-value duration and easing classes
 * are ambiguous and Tailwind drops them. The easing matches `sk-landing-settle`.
 */
const SETTLE_TRANSITION = "transition-transform motion-reduce:transition-none"
const SETTLE_TIMING: React.CSSProperties = {
  transitionDuration: "900ms",
  transitionTimingFunction: "cubic-bezier(0.2, 0.9, 0.25, 1.08)",
}

/** Shared placement: CSS-only settle on first paint, transitions after the visitor takes over. */
function placement(mode: Mode, mess: string, delayMs: number): { className: string; style: React.CSSProperties } {
  if (mode === "intro") {
    return {
      className: "sk-landing-settle",
      style: { ["--sk-mess" as string]: mess, ["--sk-delay" as string]: `${delayMs}ms` },
    }
  }
  return {
    className: SETTLE_TRANSITION,
    style: {
      ...SETTLE_TIMING,
      transform: mode === "messy" ? mess : "none",
      transitionDelay: `${Math.round(delayMs / 6)}ms`,
    },
  }
}

export function HeroMotto({ freeItemCap }: { freeItemCap: number }) {
  const [mode, setMode] = React.useState<Mode>("intro")
  const [fontIds, setFontIds] = React.useState<string[]>(DEFAULT_FONT_IDS)
  const messy = mode === "messy"
  const stampText = `FREE FOR YOUR FIRST ${freeItemCap} ITEMS ✦ SHRINEKEEP ✦ `

  return (
    <div className="relative [container-type:inline-size]">
      <h1 className="relative">
        <span className="sr-only">Consumerism has never been this organized.</span>

        <span aria-hidden className="block select-none">
          {LINES.map(({ height, baseline }, line) => (
            <span
              key={line}
              className={cn("flex items-baseline whitespace-nowrap", line === 2 && "mt-[1cqw]", LINE_ALIGN[line])}
              style={{ height: `${height}cqw`, gap: `${WORD_GAP}cqw` }}
            >
              {/*
                Pins the baseline. Baseline-aligned flex items hang from whichever reaches highest
                above its baseline, and this strut always does: the words below have no line height,
                so only their baselines take part. Its margin cancels the gap it would add.
              */}
              <span className="w-0 shrink-0" style={{ height: `${baseline}cqw`, marginRight: `-${WORD_GAP}cqw` }} />
              {line === 1 && (
                <span
                  className="mr-auto hidden self-center text-[2.1cqw] italic leading-none text-muted-foreground sm:block -rotate-6"
                  style={{ fontFamily: LANDING_FONT.sourceItalic }}
                >
                  (finally)
                </span>
              )}
              {WORDS.map((word, i) => {
                if (word.line !== line) return null
                const font = mottoFont(fontIds[i])
                const place = placement(mode, word.mess, 200 + i * 90)
                const isLast = i === WORDS.length - 1
                return (
                  <span
                    key={word.text}
                    className={cn(
                      "relative inline-block leading-[0] text-foreground will-change-transform",
                      // Own stacking context, so the highlight's -z-10 stays behind this word only.
                      isLast && "isolate",
                      place.className
                    )}
                    style={{
                      ...place.style,
                      fontFamily: font.family,
                      fontWeight: font.weight,
                      fontStyle: font.italic ? "italic" : "normal",
                      textTransform: font.upper ? "uppercase" : "none",
                      letterSpacing: font.tracking ?? "normal",
                      fontSize: `${fontSizeCqw(word, i, font)}cqw`,
                    }}
                  >
                    {isLast && (
                      // Offsets are from the word's zero-height box, which sits at mid-glyph.
                      <span
                        className="absolute -inset-x-[1.5cqw] bottom-[-0.37em] top-[-0.15em] -z-10 -skew-x-6 rounded-sm"
                        style={{ background: "hsl(var(--tag-yellow))" }}
                      />
                    )}
                    {word.text}
                  </span>
                )
              })}
            </span>
          ))}
        </span>

        {/* Rotating stamp sits in the gap the first line leaves on the right. */}
        <span
          aria-hidden
          className={cn("pointer-events-none absolute right-0 top-[0.5cqw] hidden w-[14cqw] sm:block", SETTLE_TRANSITION)}
          style={{ ...SETTLE_TIMING, transform: messy ? "translate(-6cqw, 9cqw) rotate(24deg)" : "rotate(8deg)" }}
        >
          {/* The spin is on the <svg>, not a group inside it, so the browser can composite it. */}
          <svg viewBox="0 0 100 100" className="sk-landing-spin block w-full overflow-visible">
            <defs>
              <path id="sk-stamp-ring" d="M50 50m-39 0a39 39 0 1 1 78 0a39 39 0 1 1-78 0" />
            </defs>
            <circle cx="50" cy="50" r="48.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
            <text fontSize="8.4" fontWeight="600" fill="hsl(var(--foreground))" style={{ fontFamily: LANDING_FONT.mono }}>
              <textPath href="#sk-stamp-ring" textLength="243" lengthAdjust="spacing">
                {stampText}
              </textPath>
            </text>
            <circle cx="50" cy="50" r="27" fill="hsl(var(--tag-yellow))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
          </svg>
          <SiteLogoMark
            strokeWidth={5}
            className="absolute left-1/2 top-1/2 h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 text-foreground"
          />
        </span>
      </h1>

      {/* The shelf: nine figures, in order, on a line. */}
      <div className="relative z-10 mt-[3.5cqw]">
        <div className="flex items-end justify-between gap-1 border-b-[3px] border-foreground px-[1.5cqw]">
          {KEEPERS.map((spec, i) => {
            const place = placement(mode, KEEPER_MESS[i], 700 + i * 70)
            return (
              <div
                key={spec.id}
                className={cn("w-[8cqw] min-w-[30px] max-w-[104px] will-change-transform", place.className)}
                style={place.style}
              >
                {/* The hop is started here and cleared when it finishes, so leaving early cannot cut it short. */}
                <div
                  onPointerEnter={(event) => event.currentTarget.classList.add("sk-landing-hop-run")}
                  onAnimationEnd={(event) => event.currentTarget.classList.remove("sk-landing-hop-run")}
                >
                  <Keeper spec={spec} title={`${spec.name}, a ShrineKeep Keeper figure`} className="w-full" />
                </div>
              </div>
            )
          })}
        </div>

        <div
          className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-fluid-xs uppercase tracking-wider text-muted-foreground"
          style={{ fontFamily: LANDING_FONT.mono }}
        >
          <p>
            Put your ducks in a row <span aria-hidden>/</span>{" "}
            <a href="#blind-box" className="text-foreground underline underline-offset-4 hover:no-underline">
              win all nine below
            </a>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFontIds((current) => pickFonts(current))}
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-background px-2.5 py-1 font-semibold uppercase tracking-wider text-foreground transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
              Shuffle fonts
            </button>
            <button
              type="button"
              onClick={() => setMode(messy ? "tidy" : "messy")}
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-foreground px-2.5 py-1 font-semibold uppercase tracking-wider text-background transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {messy ? <Sparkles className="h-3.5 w-3.5" aria-hidden /> : <Wind className="h-3.5 w-3.5" aria-hidden />}
              {messy ? "Organize it" : "Mess it up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
