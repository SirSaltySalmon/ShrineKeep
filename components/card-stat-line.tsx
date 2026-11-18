import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import type { CardDensity } from "@/lib/card-density"

interface CardStatLineProps {
  label: string
  /** Already formatted. */
  value: string
  density: CardDensity
  className?: string
  style?: CSSProperties
}

/**
 * A "Label: figure" row on an item or box card.
 *
 * Comfortable is one truncating line, as it has always been. Compact cards can be half as
 * wide, so there the label gives way first and the figure is never cut.
 */
export function CardStatLine({ label, value, density, className, style }: CardStatLineProps) {
  if (density === "compact") {
    return (
      <div className={cn("flex min-w-0 gap-1", className)} style={style}>
        <span className="min-w-0 truncate">{label}:</span>
        <span className="shrink-0">{value}</span>
      </div>
    )
  }
  return (
    <div className={cn("truncate", className)} style={style}>
      {label}: {value}
    </div>
  )
}
