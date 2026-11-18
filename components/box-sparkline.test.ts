import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import BoxSparkline, { type BoxSparklineProps } from "./box-sparkline"

const series = {
  dates: ["2026-01-01", "2026-01-11", "2026-02-10"],
  value: [0, 50, 100],
  acquisition: [25, 25, 75],
  currentValue: 100,
  totalAcquisition: 75,
}

const render = (props: BoxSparklineProps) => renderToStaticMarkup(createElement(BoxSparkline, props))

describe("BoxSparkline", () => {
  it("draws the value and acquisition lines with the graph tokens", () => {
    const html = render({ series })
    expect(html).toContain('points="0,30 25,16 100,2"')
    expect(html).toContain('points="0,23 25,23 100,9"')
    expect(html).toContain('stroke="hsl(var(--graph-value-color))"')
    expect(html).toContain('stroke="hsl(var(--graph-acquisition-color))"')
    expect(html).toContain('stroke="hsl(var(--graph-grid-color))"')
    expect(html.match(/<polyline/g)).toHaveLength(2)
  })

  it("draws the dashed cost line over the solid value line, so both show where they coincide", () => {
    const html = render({ series })
    expect(html.indexOf("--graph-value-color")).toBeLessThan(html.indexOf("--graph-acquisition-color"))
    expect(html.match(/stroke-dasharray/g)).toHaveLength(1)
    expect(html).toMatch(/--graph-acquisition-color\)\)"[^>]*stroke-dasharray="4 3"/)
  })

  it("is 32px tall and full width by default, and takes a height", () => {
    expect(render({ series })).toContain('style="height:32px"')
    expect(render({ series })).toContain("w-full")
    const tall = render({ series, height: 36 })
    expect(tall).toContain('style="height:36px"')
    expect(tall).toContain('viewBox="0 0 100 36"')
  })

  it("is hidden from assistive tech unless given a label", () => {
    const decorative = render({ series })
    expect(decorative).toContain('aria-hidden="true"')
    expect(decorative).not.toContain("role=")

    const labelled = render({ series, label: "Value and cost over time" })
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="Value and cost over time"')
    expect(labelled).not.toContain("aria-hidden")
  })

  it("renders nothing with fewer than two points", () => {
    expect(render({})).toBe("")
    expect(render({ series: null })).toBe("")
    expect(render({ series: { ...series, dates: [], value: [], acquisition: [] } })).toBe("")
    expect(
      render({ series: { ...series, dates: ["2026-07-01"], value: [20], acquisition: [] } })
    ).toBe("")
  })

  it("can hold its height while there is nothing to draw", () => {
    const html = render({ reserveSpace: true })
    expect(html).toContain('style="height:32px"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("<svg")
  })

  it("draws only the value line when there is no acquisition data", () => {
    const html = render({ series: { ...series, acquisition: [] } })
    expect(html.match(/<polyline/g)).toHaveLength(1)
    expect(html).not.toContain("--graph-acquisition-color")
  })

  describe("source", () => {
    const src = readFileSync(fileURLToPath(new URL("./box-sparkline.tsx", import.meta.url)), "utf8")

    it("paints only with named tokens (docs/DESIGN.md)", () => {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(src).not.toMatch(/\brgba?\(/)
      const colours = src.match(/hsl\([^)]*\)+/g) ?? []
      expect(colours.length).toBeGreaterThan(0)
      for (const colour of colours) expect(colour).toMatch(/^hsl\(var\(--graph-[a-z-]+\)\)$/)
    })

    it("stays a plain SVG with no charting library or landing imports", () => {
      expect(src).not.toContain("recharts")
      expect(src).not.toContain("components/landing")
    })
  })
})
