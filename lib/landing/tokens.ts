/**
 * Landing-only tokens, shared by `app/landing` and `components/landing`.
 * The mixed-type rule is a marketing exception (docs/DESIGN.md): do not import these in the app.
 */

/** Font stacks by name. Italic stacks put the route's true italic cut (`app/landing/fonts.ts`) first. */
export const LANDING_FONT = {
  bebas: "var(--font-bebas-neue), sans-serif",
  playfairItalic: "var(--font-landing-playfair-italic), var(--font-playfair-display), serif",
  sourceItalic: "var(--font-landing-source-serif-italic), var(--font-source-serif-4), serif",
  merriweather: "var(--font-merriweather), Georgia, serif",
  roboto: "var(--font-roboto), sans-serif",
  inter: "var(--font-inter), sans-serif",
  mono: "var(--font-jetbrains-mono), ui-monospace, monospace",
  lora: "var(--font-lora), Georgia, serif",
  outfit: "var(--font-outfit), sans-serif",
  raleway: "var(--font-raleway), sans-serif",
} as const

/** The poster's offset shadow: solid ink, no blur. */
export const HARD_SHADOW = "shadow-[6px_6px_0_0_hsl(var(--foreground))]"
