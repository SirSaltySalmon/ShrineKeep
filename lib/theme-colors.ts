import type { Theme, ThemeOutline } from "./types"

/** Theme keys that are editable colors (excludes the non-color fields radius and outline). */
export type ThemeColorKey = keyof Omit<Theme, "radius" | "outline">

export interface ThemeColorEntry {
  key: ThemeColorKey
  label: string
  defaultLight: string
  defaultDark: string
}

/**
 * Single source of truth for theme colors. Add a new color here and to the
 * appropriate THEME_EDITOR_GROUPS[].keys; then add the key to Theme in types.ts.
 */
export const THEME_COLOR_REGISTRY: ThemeColorEntry[] = [
  // Page & surfaces
  { key: "background", label: "Background", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "foreground", label: "Foreground (text)", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  { key: "card", label: "Card", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "cardForeground", label: "Card text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  { key: "popover", label: "Popover", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "popoverForeground", label: "Popover text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  // Buttons & actions
  { key: "primary", label: "Primary (e.g. Save)", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "primaryForeground", label: "Primary text", defaultLight: "210 40% 98%", defaultDark: "222.2 47.4% 11.2%" },
  { key: "secondary", label: "Secondary", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "secondaryForeground", label: "Secondary text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "muted", label: "Muted", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "mutedForeground", label: "Muted text", defaultLight: "215.4 16.3% 46.9%", defaultDark: "215 20.2% 65.1%" },
  { key: "lightMuted", label: "Light muted", defaultLight: "210 25% 98.2%", defaultDark: "228 50% 7.8%" },
  { key: "accent", label: "Accent (hover)", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "accentForeground", label: "Accent text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  // Borders & focus
  { key: "border", label: "Border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "input", label: "Input border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "ring", label: "Focus ring", defaultLight: "222.2 84% 4.9%", defaultDark: "212.7 26.8% 83.9%" },
  { key: "selectableHoverRing", label: "Selection hover ring", defaultLight: "222.2 25% 88%", defaultDark: "217 20% 28%" },
  // Destructive
  { key: "destructive", label: "Destructive", defaultLight: "0 84.2% 60.2%", defaultDark: "0 62.8% 30.6%" },
  { key: "destructiveForeground", label: "Destructive text", defaultLight: "210 40% 98%", defaultDark: "210 40% 98%" },
  // Values & data
  { key: "valueColor", label: "Value color", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "acquisitionColor", label: "Acquisition color", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  // Graph
  { key: "graphValueColor", label: "Graph value line", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "graphAcquisitionColor", label: "Graph acquisition line", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  { key: "graphAxisColor", label: "Graph axes & labels", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "graphGridColor", label: "Graph grid lines", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 22%" },
  { key: "graphTooltipBackground", label: "Graph tooltip background", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "graphTooltipForeground", label: "Graph tooltip text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  // Thumbnail
  { key: "thumbnailColor", label: "Thumbnail fill", defaultLight: "38 92% 50%", defaultDark: "38 92% 55%" },
  { key: "thumbnailForeground", label: "Thumbnail text & icons", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  { key: "thumbnailHighlight", label: "Thumbnail highlight", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  { key: "thumbnailHover", label: "Thumbnail icon hover", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  // Tag colors
  { key: "tagRed", label: "Red", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  { key: "tagOrange", label: "Orange", defaultLight: "25 95% 53%", defaultDark: "25 90% 60%" },
  { key: "tagYellow", label: "Yellow", defaultLight: "45 93% 47%", defaultDark: "45 90% 55%" },
  { key: "tagGreen", label: "Green", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "tagBlue", label: "Blue", defaultLight: "217 91% 60%", defaultDark: "217 85% 65%" },
  { key: "tagIndigo", label: "Indigo", defaultLight: "239 84% 67%", defaultDark: "239 80% 72%" },
  { key: "tagViolet", label: "Violet", defaultLight: "258 90% 66%", defaultDark: "258 85% 72%" },
  { key: "tagForeground", label: "Tag text color", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
]

export const THEME_COLOR_KEYS: ThemeColorKey[] = THEME_COLOR_REGISTRY.map((e) => e.key)

const registryByKey = new Map(THEME_COLOR_REGISTRY.map((e) => [e.key, e]))

export function getThemeColorMeta(key: ThemeColorKey): { label: string; defaultLight: string; defaultDark: string } {
  const entry = registryByKey.get(key)
  if (!entry) throw new Error(`Unknown theme color key: ${key}`)
  return { label: entry.label, defaultLight: entry.defaultLight, defaultDark: entry.defaultDark }
}

/** Convert Theme camelCase key to CSS variable name (--kebab-case). */
function themeKeyToCssVar(key: ThemeColorKey | "radius"): string {
  if (key === "radius") return "--radius"
  return "--" + key.replace(/([A-Z])/g, "-$1").toLowerCase()
}

/** Map of Theme color keys (and radius) to CSS variable names. Used by applyColorScheme. */
export const THEME_KEY_TO_CSS_VAR: Record<ThemeColorKey | "radius", string> = {
  ...Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, themeKeyToCssVar(k)])),
  radius: "--radius",
} as Record<ThemeColorKey | "radius", string>

/** Outline a theme has when the field is missing (every theme saved before the field existed). */
export const DEFAULT_THEME_OUTLINE: ThemeOutline = "soft"

/** Editor options for `Theme.outline`. */
export const THEME_OUTLINE_OPTIONS: { value: ThemeOutline; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "hard", label: "Hard" },
]

export function isThemeOutline(value: unknown): value is ThemeOutline {
  return value === "soft" || value === "hard"
}

/** Missing or unrecognised values are soft, so old saved themes and bad imports look as they always did. */
export function normalizeThemeOutline(value: unknown): ThemeOutline {
  return isThemeOutline(value) ? value : DEFAULT_THEME_OUTLINE
}

/**
 * CSS variables `Theme.outline` drives. The classes that read them are the `sk-outline*`,
 * `sk-rule-*`, `sk-raised*`, `sk-flat*` and `sk-btn*` rules in app/globals.css.
 *
 * `--outline-color` is the ink line of objects (cards, dialogs, menus, buttons, inputs).
 * `--outline-muted` is the quieter line of backdrops (the panels objects sit on, and dividers),
 * so they blend into the page instead of competing with the objects.
 *
 * `--outline-flat` is the shadow of anything that must NOT be raised under a hard outline:
 * the panels cards sit on, and anything nested inside an already raised surface.
 */
export const THEME_OUTLINE_CSS_VARS = [
  "--outline-width",
  "--outline-color",
  "--outline-muted",
  "--outline-shadow",
  "--outline-flat",
] as const
export type ThemeOutlineCssVar = (typeof THEME_OUTLINE_CSS_VARS)[number]

const HARD_OUTLINE_CSS_VARS: Record<ThemeOutlineCssVar, string> = {
  "--outline-width": "2px",
  "--outline-color": "hsl(var(--foreground))",
  "--outline-muted": "hsl(var(--border))",
  "--outline-shadow": "4px 4px 0 0 hsl(var(--foreground))",
  "--outline-flat": "0 0 #0000",
}

/**
 * Values for the outline variables. Hard sets all of them. Soft sets each to `initial`, which
 * un-defines a custom property: every `var(--outline-*, fallback)` then uses its fallback (the
 * original look), even when the element sits inside a hard-themed ancestor.
 */
export function getThemeOutlineCssVars(outline: unknown): Record<ThemeOutlineCssVar, string> {
  if (normalizeThemeOutline(outline) === "hard") return { ...HARD_OUTLINE_CSS_VARS }
  return {
    "--outline-width": "initial",
    "--outline-color": "initial",
    "--outline-muted": "initial",
    "--outline-shadow": "initial",
    "--outline-flat": "initial",
  }
}

/** Editor options for `Theme.radius`, and the only radii a theme may carry. */
export const THEME_RADIUS_OPTIONS = [
  { value: "0", label: "None" },
  { value: "0.25rem", label: "Small" },
  { value: "0.5rem", label: "Medium" },
  { value: "0.75rem", label: "Large" },
] as const
export type ThemeRadius = (typeof THEME_RADIUS_OPTIONS)[number]["value"]

/** Radius a theme has when the field is missing. Same value as `--radius` on `:root` in app/globals.css. */
export const DEFAULT_THEME_RADIUS: ThemeRadius = "0.5rem"

export function isThemeRadius(value: unknown): value is ThemeRadius {
  return THEME_RADIUS_OPTIONS.some((option) => option.value === value)
}

/**
 * A stored color: `"H S% L%"`. No `hsl()` wrapper, no commas, no alpha: this is the one form
 * that renders both as `hsl(var(--token))` and under an opacity utility such as `bg-primary/90`.
 */
export const HSL_TRIPLE_PATTERN = /^\d+(?:\.\d+)? \d+(?:\.\d+)?% \d+(?:\.\d+)?%$/

/** Well above any real triple ("359.9 100% 100%"); bounds what a client can store per color. */
const THEME_COLOR_MAX_LENGTH = 40

function sanitizeThemeColor(value: unknown): string | null {
  if (typeof value !== "string" || value.length > THEME_COLOR_MAX_LENGTH) return null
  const triple = value.trim().replace(/\s+/g, " ")
  return HSL_TRIPLE_PATTERN.test(triple) ? triple : null
}

/**
 * The one definition of a valid theme, for anything that did not come from our own code: a
 * settings request, a stored row, a theme file, another user's public style. Returns null
 * unless `input` is a plain object. Otherwise rebuilds it from the known color keys (HSL
 * triples), an allowed radius and a valid outline, and drops every other key and value.
 */
export function sanitizeTheme(input: unknown): Theme | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const theme: Theme = {}
  for (const key of THEME_COLOR_KEYS) {
    const color = sanitizeThemeColor(source[key])
    if (color) theme[key] = color
  }
  if (isThemeRadius(source.radius)) theme.radius = source.radius
  if (isThemeOutline(source.outline)) theme.outline = source.outline
  return theme
}

/**
 * A saved theme as the app reads it: `user_settings.color_scheme` sanitised, with the radius
 * and outline always present. Null when no theme is saved.
 *
 * Radius precedence: the legacy `border_radius` column, then `color_scheme.radius`, then the default.
 */
export function normalizeStoredTheme(colorScheme: unknown, borderRadius?: unknown): Theme | null {
  const theme = sanitizeTheme(colorScheme)
  if (!theme) return null
  return {
    ...theme,
    radius: isThemeRadius(borderRadius) ? borderRadius : theme.radius ?? DEFAULT_THEME_RADIUS,
    outline: normalizeThemeOutline(theme.outline),
  }
}

/** Build a full Theme from registry defaults plus radius and outline. */
function buildScheme(
  getDefault: (e: ThemeColorEntry) => string,
  overrides: Partial<Theme> = {}
): Theme {
  const scheme: Theme = { ...overrides }
  for (const e of THEME_COLOR_REGISTRY) {
    (scheme as Record<string, string>)[e.key] = getDefault(e)
  }
  scheme.radius = overrides.radius ?? DEFAULT_THEME_RADIUS
  scheme.outline = overrides.outline ?? DEFAULT_THEME_OUTLINE
  return scheme
}

export const DEFAULT_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultLight)
export const DARK_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultDark)

/** Pink Mode: light theme based on light pink. */
export const PINK_COLOR_SCHEME: Theme = {
  ...buildScheme((e) => e.defaultLight),
  background: "340 45% 98%",
  foreground: "340 30% 14%",
  card: "340 40% 99%",
  cardForeground: "340 30% 14%",
  popover: "340 40% 99%",
  popoverForeground: "340 30% 14%",
  primary: "340 70% 48%",
  primaryForeground: "0 0% 100%",
  secondary: "340 35% 94%",
  secondaryForeground: "340 45% 28%",
  muted: "340 30% 95%",
  mutedForeground: "340 20% 42%",
  lightMuted: "340 28% 97%",
  accent: "340 35% 93%",
  accentForeground: "340 45% 28%",
  border: "340 25% 90%",
  input: "340 25% 90%",
  ring: "340 60% 45%",
  selectableHoverRing: "340 35% 82%",
  radius: DEFAULT_THEME_RADIUS,
}

/** Matcha: warm green-on-cream light theme with tight corners. */
export const MATCHA_COLOR_SCHEME: Theme = {
  ...buildScheme((e) => e.defaultLight),
  background: "80 30% 94%",
  foreground: "150 30% 12%",
  card: "80 36% 97%",
  cardForeground: "150 30% 12%",
  popover: "80 36% 97%",
  popoverForeground: "150 30% 12%",
  primary: "150 45% 24%",
  primaryForeground: "80 40% 96%",
  secondary: "85 28% 86%",
  secondaryForeground: "150 40% 18%",
  muted: "85 25% 88%",
  mutedForeground: "150 12% 36%",
  lightMuted: "80 28% 91%",
  accent: "85 28% 84%",
  accentForeground: "150 40% 18%",
  border: "90 18% 76%",
  input: "90 18% 76%",
  ring: "150 45% 24%",
  selectableHoverRing: "90 20% 70%",
  valueColor: "150 60% 28%",
  acquisitionColor: "12 70% 46%",
  graphValueColor: "150 60% 28%",
  graphAcquisitionColor: "12 70% 46%",
  graphAxisColor: "90 18% 70%",
  graphGridColor: "90 18% 82%",
  graphTooltipBackground: "80 36% 97%",
  graphTooltipForeground: "150 30% 12%",
  thumbnailColor: "35 70% 48%",
  radius: "0.25rem",
}

/** Arcade: dark violet with neon magenta, cyan and mint, square corners. */
export const ARCADE_COLOR_SCHEME: Theme = {
  ...buildScheme((e) => e.defaultDark),
  background: "258 45% 8%",
  foreground: "180 80% 92%",
  card: "258 40% 12%",
  cardForeground: "180 80% 92%",
  popover: "258 40% 12%",
  popoverForeground: "180 80% 92%",
  primary: "322 95% 60%",
  primaryForeground: "258 45% 8%",
  secondary: "258 30% 20%",
  secondaryForeground: "180 80% 92%",
  muted: "258 30% 18%",
  mutedForeground: "258 25% 72%",
  lightMuted: "258 40% 10%",
  accent: "258 30% 22%",
  accentForeground: "180 80% 92%",
  border: "280 50% 30%",
  input: "280 50% 30%",
  ring: "180 100% 60%",
  selectableHoverRing: "280 40% 42%",
  destructive: "345 80% 42%",
  destructiveForeground: "0 0% 100%",
  valueColor: "160 100% 50%",
  acquisitionColor: "340 100% 70%",
  graphValueColor: "160 100% 50%",
  graphAcquisitionColor: "340 100% 70%",
  graphAxisColor: "258 30% 30%",
  graphGridColor: "258 30% 22%",
  graphTooltipBackground: "258 40% 12%",
  graphTooltipForeground: "180 80% 92%",
  thumbnailColor: "50 100% 55%",
  thumbnailForeground: "258 45% 8%",
  // Dark icons sit on a yellow thumbnail, so the hover state inverts instead of going white-on-white.
  thumbnailHighlight: "258 45% 8%",
  thumbnailHover: "50 100% 55%",
  tagForeground: "258 45% 8%",
  radius: "0",
}

/**
 * Editor group config: title and which color keys to show.
 * Preview JSX stays in the theme-editor component.
 */
export interface ThemeEditorGroupConfig {
  id: string
  title: string
  keys: ThemeColorKey[]
}

export const THEME_EDITOR_GROUPS: ThemeEditorGroupConfig[] = [
  { id: "page", title: "Page & surfaces", keys: ["background", "foreground", "card", "cardForeground", "popover", "popoverForeground", "lightMuted"] },
  { id: "buttons", title: "Buttons & actions", keys: ["primary", "primaryForeground", "secondary", "secondaryForeground", "muted", "mutedForeground", "accent", "accentForeground"] },
  { id: "borders", title: "Borders & focus", keys: ["border", "input", "ring", "selectableHoverRing"] },
  { id: "destructive", title: "Destructive", keys: ["destructive", "destructiveForeground"] },
  { id: "values", title: "Values & data", keys: ["valueColor", "acquisitionColor"] },
  { id: "graph", title: "Graph", keys: ["graphValueColor", "graphAcquisitionColor", "graphAxisColor", "graphGridColor", "graphTooltipBackground", "graphTooltipForeground"] },
  { id: "thumbnail", title: "Thumbnail", keys: ["thumbnailColor", "thumbnailForeground", "thumbnailHighlight", "thumbnailHover"] },
  { id: "tags", title: "Tag colors", keys: ["tagRed", "tagOrange", "tagYellow", "tagGreen", "tagBlue", "tagIndigo", "tagViolet", "tagForeground"] },
]
