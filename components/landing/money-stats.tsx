import { formatCurrency } from "@/lib/utils"

/**
 * Class sets are whole strings on purpose: `cn` (tailwind-merge) reads `text-fluid-*` as a
 * colour and would drop it next to a real colour class.
 */
const SIZE = {
  /** The mock dashboard's stats card (`bg-card`). */
  sm: { row: "gap-x-4", label: "text-fluid-xs", figure: "text-fluid-lg", profit: "text-card-foreground" },
  /** The game's ledger (`bg-background`). */
  md: { row: "gap-x-5", label: "text-fluid-sm", figure: "text-fluid-xl", profit: "text-foreground" },
} as const

/** The three numbers ShrineKeep keeps for a collection: what it is worth, what was paid, the difference. */
export function MoneyStats({ value, spent, size }: { value: number; spent: number; size: keyof typeof SIZE }) {
  const classes = SIZE[size]
  const profit = value - spent
  return (
    <div className={`flex flex-wrap items-baseline gap-y-1 ${classes.row}`}>
      <span className={`${classes.label} text-muted-foreground`}>
        Value{" "}
        <strong className={`${classes.figure} font-semibold`} style={{ color: "hsl(var(--value-color))" }}>
          {formatCurrency(value)}
        </strong>
      </span>
      <span className={`${classes.label} text-muted-foreground`}>
        Acquisition{" "}
        <strong className={`${classes.figure} font-semibold`} style={{ color: "hsl(var(--acquisition-color))" }}>
          {formatCurrency(spent)}
        </strong>
      </span>
      <span className={`${classes.label} text-muted-foreground`}>
        Profit{" "}
        <strong className={`${classes.figure} font-semibold ${classes.profit}`}>
          {profit >= 0 ? "+" : "-"}
          {formatCurrency(Math.abs(profit))}
        </strong>
      </span>
    </div>
  )
}
