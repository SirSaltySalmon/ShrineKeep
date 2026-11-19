import { cn } from "@/lib/utils"

/**
 * "Keepers" are ShrineKeep's blind-box figures: one parametric SVG, nine
 * variants. The landing page uses them on the hero shelf and in the game; the
 * product uses one per empty state (see `components/empty-state.tsx`).
 * They paint only with theme tokens, so they follow whatever scheme is in
 * scope: a user's theme, a shared public theme, or the landing mock's.
 */

export type KeeperTopper =
  | "sprout"
  | "flame"
  | "antenna"
  | "bow"
  | "ears"
  | "horns"
  | "halo"
  | "crown"

export type KeeperFace = "smile" | "stern" | "o" | "wink" | "sleepy" | "star"

export type KeeperRarity = "common" | "rare" | "secret"

export interface KeeperSpec {
  id: string
  name: string
  /** CSS variable name (without `--`) holding an HSL triple. */
  colorVar: string
  topper: KeeperTopper
  face: KeeperFace
  rarity: KeeperRarity
}

export const KEEPERS: KeeperSpec[] = [
  { id: "moss", name: "Moss", colorVar: "tag-green", topper: "sprout", face: "smile", rarity: "common" },
  { id: "ember", name: "Ember", colorVar: "tag-orange", topper: "flame", face: "stern", rarity: "common" },
  { id: "tide", name: "Tide", colorVar: "tag-blue", topper: "antenna", face: "o", rarity: "common" },
  { id: "plum", name: "Plum", colorVar: "tag-violet", topper: "bow", face: "wink", rarity: "common" },
  { id: "dusk", name: "Dusk", colorVar: "tag-indigo", topper: "ears", face: "sleepy", rarity: "common" },
  { id: "oni", name: "Oni", colorVar: "tag-red", topper: "horns", face: "stern", rarity: "rare" },
  { id: "saint", name: "Saint", colorVar: "tag-yellow", topper: "halo", face: "smile", rarity: "rare" },
  { id: "ink", name: "Ink", colorVar: "foreground", topper: "ears", face: "wink", rarity: "rare" },
  { id: "gilt", name: "Gilt", colorVar: "thumbnail-color", topper: "crown", face: "star", rarity: "secret" },
]

export const RARITY_LABEL: Record<KeeperRarity, string> = {
  common: "Common",
  rare: "Rare",
  secret: "Secret",
}

const INK = "hsl(var(--foreground))"
const PAPER = "hsl(var(--card))"

function Topper({ kind, body }: { kind: KeeperTopper; body: string }) {
  const outline = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const
  switch (kind) {
    case "sprout":
      return (
        <g {...outline}>
          <path d="M32 16V8" fill="none" />
          <path d="M32 9C27 2 20 5 21 10c4 2 8 1 11-1Z" fill="hsl(var(--tag-green))" />
          <path d="M32 9c5-7 12-4 11 1-4 2-8 1-11-1Z" fill="hsl(var(--tag-green))" />
        </g>
      )
    case "flame":
      return (
        <path
          {...outline}
          d="M32 17c-7-2-8-9-3-14 0 4 4 4 5 7 2-2 2-4 2-4 4 4 3 10-4 11Z"
          fill="hsl(var(--tag-yellow))"
        />
      )
    case "antenna":
      return (
        <g {...outline}>
          <path d="M32 16V8" fill="none" />
          <circle cx="32" cy="6" r="3.5" fill="hsl(var(--tag-red))" />
        </g>
      )
    case "bow":
      return (
        <g {...outline} fill="hsl(var(--tag-red))">
          <path d="M32 13 21 7v12Z" />
          <path d="M32 13 43 7v12Z" />
          <circle cx="32" cy="13" r="3" />
        </g>
      )
    case "ears":
      return (
        <g {...outline} fill={body}>
          <path d="M17 26 14 9l13 8Z" />
          <path d="M47 26 50 9 37 17Z" />
        </g>
      )
    case "horns":
      return (
        <g {...outline} fill={PAPER}>
          <path d="M20 22 15 7l11 8Z" />
          <path d="M44 22 49 7 38 15Z" />
        </g>
      )
    case "halo":
      return (
        <g fill="none">
          <ellipse cx="32" cy="8" rx="11" ry="3.5" stroke={INK} strokeWidth={6} />
          <ellipse cx="32" cy="8" rx="11" ry="3.5" stroke="hsl(var(--thumbnail-color))" strokeWidth={2.5} />
        </g>
      )
    case "crown":
      return (
        <path
          {...outline}
          d="M21 19 18 5l8 6 6-8 6 8 8-6-3 14Z"
          fill="hsl(var(--tag-yellow))"
        />
      )
  }
}

function Face({ kind }: { kind: KeeperFace }) {
  const line = { stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const
  const dotL = <circle cx="26.5" cy="36" r="2.1" fill={INK} />
  const dotR = <circle cx="37.5" cy="36" r="2.1" fill={INK} />
  switch (kind) {
    case "smile":
      return (
        <>
          {dotL}
          {dotR}
          <path {...line} d="M28 41.5q4 3.5 8 0" />
        </>
      )
    case "stern":
      return (
        <>
          <path {...line} d="m22.5 31 6 2.2M41.5 31l-6 2.2" />
          {dotL}
          {dotR}
          <path {...line} d="M28.5 43.5q3.5-2.5 7 0" />
        </>
      )
    case "o":
      return (
        <>
          {dotL}
          {dotR}
          <circle cx="32" cy="42" r="2" fill={INK} />
        </>
      )
    case "wink":
      return (
        <>
          {dotL}
          <path {...line} d="M35 36.5q2.5-2.5 5 0" />
          <path {...line} d="M28 41.5q4 3.5 8 0" />
        </>
      )
    case "sleepy":
      return (
        <>
          <path {...line} d="M24 35.5q2.5 2.5 5 0M35 35.5q2.5 2.5 5 0" />
          <path {...line} d="M30 42.5h4" />
        </>
      )
    case "star":
      return (
        <>
          <path d="M26.5 32l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2Z" fill={INK} />
          <path d="M37.5 32l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2Z" fill={INK} />
          <path d="M28 41.5q4 5 8 0Z" fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
        </>
      )
  }
}

export function Keeper({
  spec,
  className,
  silhouette = false,
  title,
}: {
  spec: KeeperSpec
  className?: string
  /** Render as an unknown, un-pulled figure. */
  silhouette?: boolean
  title?: string
}) {
  const body = silhouette ? "hsl(var(--muted))" : `hsl(var(--${spec.colorVar}))`
  return (
    <svg
      viewBox="0 0 64 70"
      className={cn("block shrink-0 overflow-visible", className)}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {silhouette ? (
        <>
          <path
            d="M32 15c14 0 23 11 23 26 0 14-9 24-23 24S9 55 9 41c0-15 9-26 23-26Z"
            fill={body}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <text
            x="32"
            y="48"
            textAnchor="middle"
            fontSize="22"
            fontWeight="700"
            fill="hsl(var(--muted-foreground))"
            style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace" }}
          >
            ?
          </text>
        </>
      ) : (
        <>
          <Topper kind={spec.topper} body={body} />
          <path
            d="M32 15c14 0 23 11 23 26 0 14-9 24-23 24S9 55 9 41c0-15 9-26 23-26Z"
            fill={body}
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <ellipse cx="32" cy="37.5" rx="15" ry="12" fill={PAPER} stroke={INK} strokeWidth={2} />
          <circle cx="21.5" cy="41" r="2.2" fill="hsl(var(--tag-red))" opacity={0.45} />
          <circle cx="42.5" cy="41" r="2.2" fill="hsl(var(--tag-red))" opacity={0.45} />
          <Face kind={spec.face} />
          <path
            d="M25 56.5q7 3.5 14 0"
            fill="none"
            stroke={spec.colorVar === "foreground" ? PAPER : INK}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.55}
          />
        </>
      )}
    </svg>
  )
}
