"use client"

import * as React from "react"
import { Shuffle, Sparkles, Wind } from "lucide-react"
import { cn } from "@/lib/utils"
import { SiteLogoMark } from "@/components/site-logo"
import { Keeper, KEEPERS } from "@/components/landing/keeper"

/**
 * The motto is the one fixed thing on this page: six words, six typefaces.
 * Words and shelf figures load scattered and snap into place, which is the pitch.
 * Sizes are in container-query units so the poster scales as one object.
 */

interface MottoFont {
  id: string
  family: string
  weight: number
  italic?: boolean
  upper?: boolean
  tracking?: string
  /**
   * Measured advance of each motto word in em, in WORDS order, at this face's weight and style.
   * Lets any face fill the same slot, so the poster keeps its shape through a shuffle.
   * Re-measure if the motto, a weight, or a tracking value changes.
   */
  widths: [number, number, number, number, number, number]
}

const FONTS: MottoFont[] = [
  {
    id: "bebas",
    family: "var(--font-bebas-neue), sans-serif",
    weight: 400,
    upper: true,
    widths: [4.39, 1.19, 1.94, 1.56, 1.35, 3.53],
  },
  {
    id: "playfair",
    family: "var(--font-landing-playfair-italic), var(--font-playfair-display), serif",
    weight: 900,
    italic: true,
    widths: [6.49, 1.62, 2.63, 2.19, 1.74, 4.96],
  },
  { id: "roboto", family: "var(--font-roboto), sans-serif", weight: 700, widths: [6.27, 1.61, 2.5, 2.2, 1.68, 4.75] },
  {
    id: "merriweather",
    family: "var(--font-merriweather), Georgia, serif",
    weight: 700,
    widths: [6.93, 1.75, 2.8, 2.4, 1.92, 5.24],
  },
  {
    id: "source",
    family: "var(--font-landing-source-serif-italic), var(--font-source-serif-4), serif",
    weight: 900,
    italic: true,
    widths: [6.77, 1.75, 2.77, 2.29, 1.84, 5.3],
  },
  {
    id: "inter",
    family: "var(--font-inter), sans-serif",
    weight: 600,
    tracking: "-0.045em",
    widths: [6.23, 1.6, 2.52, 2.24, 1.6, 4.69],
  },
  {
    id: "mono",
    family: "var(--font-jetbrains-mono), ui-monospace, monospace",
    weight: 600,
    widths: [6.6, 1.8, 3, 2.4, 2.4, 6],
  },
  { id: "lora", family: "var(--font-lora), Georgia, serif", weight: 700, widths: [6.67, 1.63, 2.72, 2.29, 1.85, 4.96] },
  { id: "outfit", family: "var(--font-outfit), sans-serif", weight: 700, widths: [6.26, 1.63, 2.63, 2.26, 1.69, 4.91] },
  { id: "raleway", family: "var(--font-raleway), sans-serif", weight: 700, widths: [6.6, 1.67, 2.71, 2.44, 1.74, 5.01] },
]

const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]))

interface MottoWord {
  text: string
  line: 0 | 1 | 2
  /** Target rendered width in cqw. */
  width: number
  /** Font-size ceiling in cqw. */
  max: number
  font: string
  /** Where the word sits before the page is organized. */
  mess: string
}

const WORDS: MottoWord[] = [
  { text: "Consumerism", line: 0, width: 63, max: 15, font: "bebas", mess: "translate(-2cqw, 6cqw) rotate(-8deg)" },
  { text: "has", line: 0, width: 16, max: 12, font: "playfair", mess: "translate(5cqw, -3cqw) rotate(16deg)" },
  { text: "never", line: 1, width: 31, max: 12, font: "roboto", mess: "translate(-7cqw, 2cqw) rotate(10deg)" },
  { text: "been", line: 1, width: 26, max: 11, font: "merriweather", mess: "translate(3cqw, 5cqw) rotate(-13deg)" },
  { text: "this", line: 1, width: 19, max: 12, font: "source", mess: "translate(4cqw, -4cqw) rotate(19deg)" },
  { text: "organized.", line: 2, width: 84, max: 17.5, font: "inter", mess: "translate(2cqw, 3cqw) rotate(-5deg)" },
]

const DEFAULT_FONT_IDS = WORDS.map((w) => w.font)

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

const SETTLE_EASE = "cubic-bezier(0.2, 0.9, 0.25, 1.08)"

type Mode = "intro" | "messy" | "tidy"

/** Shared placement style: CSS-only settle on first paint, transitions after the visitor takes over. */
function placement(mode: Mode, mess: string, delayMs: number): { className?: string; style: React.CSSProperties } {
  if (mode === "intro") {
    return {
      className: "sk-landing-settle",
      style: { ["--sk-mess" as string]: mess, ["--sk-delay" as string]: `${delayMs}ms` },
    }
  }
  return {
    style: {
      transform: mode === "messy" ? mess : "none",
      transition: `transform 900ms ${SETTLE_EASE}`,
      transitionDelay: `${Math.round(delayMs / 6)}ms`,
    },
  }
}

function fontSizeCqw(word: MottoWord, index: number, font: MottoFont): number {
  const fitted = word.width / font.widths[index]
  return Math.round(Math.min(word.max, fitted) * 100) / 100
}

function pickFonts(current: string[]): string[] {
  const pool = [...FONTS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const next = pool.slice(0, WORDS.length).map((f) => f.id)
  // A shuffle that changes nothing reads as a broken button.
  return next.every((id, i) => id === current[i]) ? [...next.slice(1), next[0]] : next
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
          {[0, 1, 2].map((line) => (
            <span
              key={line}
              className={cn(
                "flex items-baseline gap-[3cqw] whitespace-nowrap leading-[0.9]",
                line === 2 && "mt-[1cqw]",
                LINE_ALIGN[line]
              )}
            >
              {line === 1 && (
                <span
                  className="mr-auto hidden self-center text-[2.1cqw] italic text-muted-foreground sm:block -rotate-6"
                  style={{ fontFamily: "var(--font-lora), Georgia, serif" }}
                >
                  (finally)
                </span>
              )}
              {WORDS.map((word, i) => {
                if (word.line !== line) return null
                const font = FONT_BY_ID.get(fontIds[i]) ?? FONTS[0]
                const place = placement(mode, word.mess, 200 + i * 90)
                const isLast = i === WORDS.length - 1
                return (
                  <span
                    key={word.text}
                    className={cn("relative inline-block text-foreground will-change-transform", place.className)}
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
                      <span
                        className="absolute -inset-x-[1.5cqw] bottom-[0.08em] top-[0.3em] -z-10 -skew-x-6 rounded-sm"
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
          className="pointer-events-none absolute right-0 top-[0.5cqw] hidden w-[14cqw] sm:block"
          style={{
            transform: messy ? "translate(-6cqw, 9cqw) rotate(24deg)" : "rotate(8deg)",
            transition: `transform 900ms ${SETTLE_EASE}`,
          }}
        >
          <svg viewBox="0 0 100 100" className="block w-full overflow-visible">
            <circle cx="50" cy="50" r="48.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
            <g className="sk-landing-spin">
              <defs>
                <path id="sk-stamp-ring" d="M50 50m-39 0a39 39 0 1 1 78 0a39 39 0 1 1-78 0" />
              </defs>
              <text
                fontSize="8.4"
                fontWeight="600"
                fill="hsl(var(--foreground))"
                style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace" }}
              >
                <textPath href="#sk-stamp-ring" textLength="243" lengthAdjust="spacing">
                  {stampText}
                </textPath>
              </text>
            </g>
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
          style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace" }}
        >
          <p>
            Series 01 <span aria-hidden>/</span> The Keepers <span aria-hidden>/</span>{" "}
            <a href="#blind-box" className="text-foreground underline underline-offset-4 hover:no-underline">
              win all nine below
            </a>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFontIds((current) => pickFonts(current))}
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-background px-2.5 py-1 font-semibold uppercase tracking-wider text-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
              Shuffle fonts
            </button>
            <button
              type="button"
              onClick={() => setMode(messy ? "tidy" : "messy")}
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-foreground px-2.5 py-1 font-semibold uppercase tracking-wider text-background transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
