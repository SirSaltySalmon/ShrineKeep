import { cn } from "@/lib/utils"
import { sparklineGeometry, type BoxSparklineSeries } from "@/lib/stats/box-sparkline"

/** Drawing width in viewBox units. The SVG stretches to its container, so only the ratio to height matters. */
const VIEW_WIDTH = 100

export interface BoxSparklineProps {
  /** One box's series from `useBoxSparklines().sparklines[box.id]`. Undefined while loading. */
  series?: BoxSparklineSeries | null
  /** Height in px. Default 32. */
  height?: number
  /**
   * Accessible name. Leave unset when the figures are already on the card as
   * text: the sparkline is then decorative and hidden from assistive tech.
   */
  label?: string
  /** Keep an empty box of the same height when there is nothing to draw, so cards do not jump when series load. */
  reserveSpace?: boolean
  className?: string
}

/**
 * A box's value and acquisition cost over time, in miniature: the overlay chart
 * from the stats dialog without axes, legend or tooltip. Value is the solid
 * line; cost is dashed as well as differently coloured, so the two stay apart
 * under any user theme.
 *
 * Draws nothing when the series has fewer than two points.
 */
export default function BoxSparkline({
  series,
  height = 32,
  label,
  reserveSpace = false,
  className,
}: BoxSparklineProps) {
  const geometry = sparklineGeometry(series, VIEW_WIDTH, height)

  if (!geometry) {
    return reserveSpace ? (
      <div className={cn("w-full", className)} style={{ height }} aria-hidden />
    ) : null
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className={cn("block w-full overflow-visible", className)}
      style={{ height }}
      fill="none"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <line
        x1={0}
        x2={VIEW_WIDTH}
        y1={geometry.baselineY}
        y2={geometry.baselineY}
        stroke="hsl(var(--graph-grid-color))"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={geometry.value}
        stroke="hsl(var(--graph-value-color))"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Cost goes on top, as in the full chart. Being dashed, it lets the value line show through where the two coincide. */}
      {geometry.acquisition && (
        <polyline
          points={geometry.acquisition}
          stroke="hsl(var(--graph-acquisition-color))"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
