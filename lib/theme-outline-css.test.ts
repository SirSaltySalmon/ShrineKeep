import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import postcss, { type AtRule } from "postcss"
import { describe, expect, it } from "vitest"
import { THEME_OUTLINE_CSS_VARS } from "./theme-colors"

/**
 * The outline classes (`sk-*`) in app/globals.css are plain CSS that tailwind-merge does not
 * know, so the cascade alone decides what an element with two of them looks like. These tests
 * pin the two properties the cascade relies on (see the comment above that block):
 * every selector is a single class, and a primitive's own defaults come before the classes a
 * caller can pass.
 */
interface OutlineRule {
  selector: string
  /** Position in the stylesheet; a later rule wins at equal specificity. */
  index: number
  media: string | null
  declarations: Record<string, string>
}

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8")

const layer = postcss
  .parse(css)
  .nodes.find(
    (node): node is AtRule => node.type === "atrule" && node.name === "layer" && node.params === "components"
  )
if (!layer) throw new Error("app/globals.css has no `@layer components` block")

const rules: OutlineRule[] = []
layer.walkRules((rule) => {
  const parent = rule.parent
  const media = parent?.type === "atrule" && (parent as AtRule).name === "media" ? (parent as AtRule).params : null
  const declarations: Record<string, string> = {}
  rule.walkDecls((declaration) => {
    declarations[declaration.prop] = declaration.value
  })
  for (const selector of rule.selectors) {
    rules.push({ selector, index: rules.length, media, declarations })
  }
})

const setsShadow = (rule: OutlineRule) => "--tw-shadow" in rule.declarations
const setsBorder = (rule: OutlineRule) => Object.keys(rule.declarations).some((prop) => prop.startsWith("border"))

function only(selector: string, family: (rule: OutlineRule) => boolean): OutlineRule {
  const matches = rules.filter((rule) => rule.selector === selector && family(rule))
  expect(matches, selector).toHaveLength(1)
  return matches[0]
}

/** Defaults a `components/ui` primitive sets for itself. A caller-facing class must be able to override them. */
const PRIMITIVE_SHADOW_DEFAULTS = [
  ".sk-btn",
  ".sk-btn-raised",
  ".sk-btn:where(:hover)",
  ".sk-btn-raised:where(:hover)",
  ".sk-card-hover",
  ".sk-card-hover:where(:hover)",
]
const PRIMITIVE_BORDER_DEFAULTS = [".sk-outline-filled"]

describe("outline classes in app/globals.css", () => {
  it("defines the classes the primitives use", () => {
    for (const selector of PRIMITIVE_SHADOW_DEFAULTS) only(selector, setsShadow)
    for (const selector of PRIMITIVE_BORDER_DEFAULTS) only(selector, setsBorder)
  })

  it("keeps every selector at one class, so a utility passed by a caller wins at rest and on hover", () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const { selector } of rules) {
      // :where() adds no specificity. What is left must be a lone class, or nothing but `> *`.
      const counted = selector.replace(/:where\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "")
      expect(counted, selector).toMatch(/^(?:\.sk-[a-z-]+)?(?:\s*>\s*\*)?$/)
    }
  })

  it("puts a primitive's own shadow before every shadow class a caller can pass", () => {
    const lastDefault = Math.max(...PRIMITIVE_SHADOW_DEFAULTS.map((selector) => only(selector, setsShadow).index))
    const callerFacing = rules.filter((rule) => setsShadow(rule) && !PRIMITIVE_SHADOW_DEFAULTS.includes(rule.selector))
    expect(callerFacing.map((rule) => rule.selector)).toEqual(
      expect.arrayContaining([".sk-raised", ".sk-raised-md", ".sk-raised-lg", ".sk-raised-xl", ".sk-flat-sm"])
    )
    for (const rule of callerFacing) {
      expect(rule.index, `${rule.selector} must come after the primitive defaults`).toBeGreaterThan(lastDefault)
    }
  })

  it("puts a filled button's border before every border class a caller can pass", () => {
    const lastDefault = Math.max(...PRIMITIVE_BORDER_DEFAULTS.map((selector) => only(selector, setsBorder).index))
    const callerFacing = rules.filter((rule) => setsBorder(rule) && !PRIMITIVE_BORDER_DEFAULTS.includes(rule.selector))
    expect(callerFacing.map((rule) => rule.selector)).toEqual(
      expect.arrayContaining([".sk-outline", ".sk-outline-control", ".sk-rule-t", ".sk-rule-b"])
    )
    for (const rule of callerFacing) {
      expect(rule.index, `${rule.selector} must come after the primitive defaults`).toBeGreaterThan(lastDefault)
    }
  })

  it("orders each hover rule after the resting rules it has to beat", () => {
    const at = (selector: string) => only(selector, setsShadow).index
    expect(at(".sk-btn")).toBeLessThan(at(".sk-btn-raised"))
    expect(at(".sk-btn-raised")).toBeLessThan(at(".sk-btn:where(:hover)"))
    expect(at(".sk-btn:where(:hover)")).toBeLessThan(at(".sk-btn-raised:where(:hover)"))
    expect(at(".sk-card-hover")).toBeLessThan(at(".sk-card-hover:where(:hover)"))
    for (const resting of [".sk-raised", ".sk-raised-md", ".sk-raised-lg", ".sk-raised-xl", ".sk-flat-sm"]) {
      expect(at(resting), resting).toBeLessThan(at(".sk-raised-hover-xl:where(:hover)"))
    }
  })

  it("adds a hover shadow to buttons and cards only when motion is allowed", () => {
    for (const selector of [".sk-btn:where(:hover)", ".sk-btn-raised:where(:hover)", ".sk-card-hover:where(:hover)"]) {
      expect(only(selector, setsShadow).media, selector).toBe("(prefers-reduced-motion: no-preference)")
    }
    // Replaced an unconditional `hover:shadow-xl`.
    expect(only(".sk-raised-hover-xl:where(:hover)", setsShadow).media).toBeNull()
  })

  it("never leaves a blurred shadow or a hardcoded colour under a hard outline", () => {
    const shadows = rules.filter((rule) => setsShadow(rule) || "box-shadow" in rule.declarations)
    for (const rule of shadows) {
      const value = rule.declarations["--tw-shadow"] ?? rule.declarations["box-shadow"]
      // A soft shadow may only be the fallback of a variable the hard outline defines.
      const soft = /theme\(|\d+px/.test(value)
      if (soft) expect(value, rule.selector).toMatch(/^var\(--outline-(?:shadow|flat), /)
    }
    expect(layer.toString()).not.toMatch(/rgba?\(/)
  })

  it("reads exactly the variables applyColorScheme() sets", () => {
    const used = Array.from(new Set(layer.toString().match(/--outline-[a-z]+/g)))
    expect(used.sort()).toEqual([...THEME_OUTLINE_CSS_VARS].sort())
  })
})
