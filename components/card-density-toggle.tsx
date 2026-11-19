"use client"

import { Grid2x2, Grid3x3, type LucideIcon } from "lucide-react"
import { cn, FOCUS_RING_CLASS } from "@/lib/utils"
import type { CardDensity } from "@/lib/card-density"
import { setCardDensity, useCardDensity } from "@/lib/hooks/use-card-density"

const OPTIONS: readonly { value: CardDensity; label: string; Icon: LucideIcon }[] = [
  { value: "comfortable", label: "Comfortable cards", Icon: Grid2x2 },
  { value: "compact", label: "Compact cards", Icon: Grid3x3 },
]

/**
 * Two-option switch for this device's card density. Styled like `TabsList` (a muted track
 * with the active option raised), sized to sit beside `size="sm"` buttons.
 */
export default function CardDensityToggle({ className }: { className?: string }) {
  const density = useCardDensity()

  return (
    <div
      role="group"
      aria-label="Card density"
      className={cn("inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md bg-muted p-1", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const pressed = density === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            aria-label={label}
            title={label}
            onClick={() => setCardDensity(value)}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-sm transition-colors",
              FOCUS_RING_CLASS,
              pressed
                ? "bg-background text-foreground sk-flat-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
