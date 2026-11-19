import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { FADE_IN_EASING, FADE_IN_MS, shouldPlayFade } from "./use-fade-on-change"

describe("shouldPlayFade", () => {
  it("does not fade content that was there on the first render", () => {
    expect(shouldPlayFade({ first: true }, "a")).toBe(false)
  })

  it("fades on mount only when asked to", () => {
    expect(shouldPlayFade({ first: true }, "a", { onMount: true })).toBe(true)
  })

  it("fades when the signal changes and not when it is the same", () => {
    expect(shouldPlayFade({ first: false, previous: "a" }, "b")).toBe(true)
    expect(shouldPlayFade({ first: false, previous: "a" }, "a")).toBe(false)
    expect(shouldPlayFade({ first: false, previous: 3 }, 4)).toBe(true)
  })

  it("treats undefined and null as values, not as 'no previous render'", () => {
    expect(shouldPlayFade({ first: false, previous: undefined }, undefined)).toBe(false)
    expect(shouldPlayFade({ first: false, previous: undefined }, "a")).toBe(true)
    expect(shouldPlayFade({ first: false, previous: null }, undefined)).toBe(true)
  })

  it("never fades while disabled, on mount or on change", () => {
    expect(shouldPlayFade({ first: true }, "a", { onMount: true, enabled: false })).toBe(false)
    expect(shouldPlayFade({ first: false, previous: "a" }, "b", { enabled: false })).toBe(false)
  })

  it("plays skeleton to content but not content to skeleton", () => {
    // The grids' usage: the loading state is part of the signal, and bones are `enabled: false`.
    expect(shouldPlayFade({ first: false, previous: "bones" }, "cards", { enabled: true })).toBe(true)
    expect(shouldPlayFade({ first: false, previous: "cards" }, "bones", { enabled: false })).toBe(false)
  })
})

describe("fade timing", () => {
  it("matches the .sk-fade-in class, so both fades look the same", () => {
    const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8")
    expect(css).toContain(`animation: sk-fade-in ${FADE_IN_MS}ms ${FADE_IN_EASING};`)
  })
})
