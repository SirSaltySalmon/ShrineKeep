import { describe, expect, it } from "vitest"
import { getPlaceholderTint, pickTintColor } from "./placeholder-tint"
import { sortTagsByColorThenName } from "./utils"
import { TAG_COLORS, type Tag, type TagColor } from "./types"

function tag(name: string, color: TagColor): Tag {
  return { id: `${color}-${name}`, user_id: "u", name, color, created_at: "" }
}

describe("pickTintColor", () => {
  it("returns null when there are no tags", () => {
    expect(pickTintColor([])).toBeNull()
    expect(pickTintColor(null)).toBeNull()
    expect(pickTintColor(undefined)).toBeNull()
  })

  it("picks the earliest rainbow slot regardless of input order", () => {
    expect(pickTintColor([tag("a", "violet"), tag("b", "green"), tag("c", "orange")])).toBe("orange")
    expect(pickTintColor([tag("c", "orange"), tag("b", "green"), tag("a", "violet")])).toBe("orange")
  })

  it("agrees with sortTagsByColorThenName for every pair of slots", () => {
    for (const a of TAG_COLORS) {
      for (const b of TAG_COLORS) {
        const tags = [tag("Zulu", a), tag("Alpha", b)]
        expect(pickTintColor(tags)).toBe(sortTagsByColorThenName(tags)[0].color)
      }
    }
  })

  it("treats a missing or unknown colour as blue, like the tag chips do", () => {
    expect(pickTintColor([{ name: "loose", color: null }])).toBe("blue")
    expect(pickTintColor([{ name: "loose", color: "teal" as TagColor }])).toBe("blue")
    expect(pickTintColor([{ name: "loose" }, tag("b", "indigo")])).toBe("blue")
    expect(pickTintColor([{ name: "loose" }, tag("b", "green")])).toBe("green")
  })
})

describe("getPlaceholderTint", () => {
  it("returns null without tags so the tile stays muted", () => {
    expect(getPlaceholderTint([])).toBeNull()
  })

  it("paints with CSS variables, never resolved colours", () => {
    expect(getPlaceholderTint([tag("b", "blue"), tag("a", "red")])).toEqual({
      background: "hsl(var(--tag-red) / 0.16)",
      color: "hsl(var(--tag-red))",
    })
  })
})
