import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"
import { publicStyleProperties } from "../presentation/style"

const owner = "b1000000-0000-4000-8000-000000000001"
const secret = "test-only-secret-at-least-thirty-two-bytes"
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })
const media = vi.fn()

async function sharedStyleFor(colorScheme: Record<string, unknown>) {
  const profile = {
    id: owner, nickname: "Collector", bio: "", avatar: null, avatarUrl: null, relationship: "none",
    sharedStyle: { colorScheme, headerFontFamily: "Inter", bodyFontFamily: "Inter", borderRadius: "0" },
  }
  const rpc = vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile }))
  const result = await createPublicReadCore(rpc, secret, media).profile(owner, { kind: "guest" })
  if (!result.ok) throw new Error("profile read failed")
  return result.data.sharedStyle
}

/** The outline lives in color_scheme next to the colors, so the public sanitiser has to let it through. */
describe("owner outline on public pages", () => {
  it("carries a hard outline into the public theme's CSS variables", async () => {
    const style = await sharedStyleFor({ background: "258 45% 8%", foreground: "180 80% 92%", outline: "hard" })
    expect(style?.colorScheme.outline).toBe("hard")
    expect(publicStyleProperties(style)).toMatchObject({
      "--outline-width": "2px",
      "--outline-color": "hsl(var(--foreground))",
      "--outline-shadow": "4px 4px 0 0 hsl(var(--foreground))",
      "--radius": "0",
    })
  })

  it("keeps a theme saved before the field existed soft", async () => {
    const style = await sharedStyleFor({ background: "0 0% 100%" })
    expect(style?.colorScheme).toEqual({ background: "0 0% 100%" })
    expect(publicStyleProperties(style)).toMatchObject({ "--outline-width": "initial", "--outline-shadow": "initial" })
  })

  it.each(["neon", "url(https://SECRET.invalid)", 2, null])("drops an outline that is not soft or hard: %j", async (outline) => {
    const style = await sharedStyleFor({ background: "0 0% 100%", outline })
    expect(style?.colorScheme).toEqual({ background: "0 0% 100%" })
    expect(JSON.stringify(style)).not.toMatch(/SECRET|neon/)
  })

  it("sets no outline variables when the owner does not share a style", () => {
    expect(publicStyleProperties(null)).toEqual({})
  })
})
