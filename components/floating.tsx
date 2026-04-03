import * as React from "react"
import { cn } from "@/lib/utils"

export type FloatingProps = {
  children: React.ReactNode
  className?: string
  /**
   * Vertical amplitude for the sine-like bob (e.g. "10px").
   */
  amplitudePx?: number
  /**
   * Duration (seconds) of the bob loop.
   */
  durationSec?: number
  /**
   * Render element type (use `span` for inline text).
   */
  as?: keyof JSX.IntrinsicElements
}

export function Floating({
  children,
  className,
  amplitudePx = 10,
  durationSec = 12,
  as: As = "div",
}: FloatingProps) {
  const style = {
    // Used by the `float-slow` keyframes in tailwind.config.ts.
    ["--float-amp" as any]: `${amplitudePx}px`,
    animationDuration: `${durationSec}s`,
  } as React.CSSProperties

  return (
    <As
      className={cn(
        // Only animate when motion is allowed.
        "motion-safe:animate-[float-slow_12s_ease-in-out_infinite]",
        "motion-reduce:animate-none",
        className
      )}
      style={style}
    >
      {children}
    </As>
  )
}

