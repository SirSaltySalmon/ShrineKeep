import Link from "next/link"
import { cn } from "@/lib/utils"

/** Stroke in SVG user units that matches Lucide’s default (2 / 24) at any rendered size. */
export const SITE_LOGO_STROKE_MATCH_LUCIDE = 109 / 12

export function SiteLogoMark({
  className,
  strokeWidth = 3,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 109 109"
      className={cn("block shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="m13.78,38.22c1.85,0.53 4.21,0.47 5.49,0.31c4.8,-0.61 13.63,-1.88 19.02,-2.91c0.92,-0.17 2.09,-0.24 2.98,0" />
        <path d="m28.36,17.25c1.19,1.19 1.29,2.75 1.29,4.67c0,0.77 0.02,47.08 0.02,62.57c0,4.33 -0.01,7.43 -0.04,8.51" />
        <path d="m29,38.75c0,1.69 -0.92,4.76 -1.48,6.25c-4.36,11.6 -7.8,17.83 -15.16,29.34" />
        <path d="m31.72,44.4c2.38,1.59 6.28,6.76 8.28,9.85" />
        <path d="m45.94,21.44c0.81,0.81 1.07,1.84 1.09,2.79c0.72,29.15 1.22,49.52 -8.53,66.27" />
        <path d="m47.63,22.05c3.62,-0.93 9.82,-2.8 11.45,-3.06c2.92,-0.46 4.42,0.38 4.42,2.98c0,7.9 0,44.69 0,62.02c0,12.08 -4.43,4.02 -6.25,1.93" />
        <path d="m48.88,41.18c2.87,-0.51 9.62,-1.54 13.5,-1.8" />
        <path d="m48,61.38c5.24,-0.64 8.19,-1.32 14.25,-1.75" />
        <path d="m75.24,18.21c0.71,0.71 1.03,1.63 1.05,2.6c1.21,47.45 -2.04,58.7 -8.48,70.45" />
        <path d="m77.49,20.58c3.34,-0.77 9.89,-2.09 12.55,-2.61c3.06,-0.6 4.7,0.29 4.7,3.59c0,8.06 -0.03,56.57 -0.03,62.87c0,7.82 -3.66,3.94 -5.42,1.81" />
        <path d="m77.85,39.82c2.87,-0.39 11.65,-1.38 15.53,-1.58" />
        <path d="m77.22,59.47c5.22,-0.53 10.11,-1.21 16.15,-1.57" />
      </g>
    </svg>
  )
}

type SiteLogoProps = {
  href?: string
  className?: string
  iconClassName?: string
  textClassName?: string
  label?: string
  /** SVG stroke width in user units; use {@link SITE_LOGO_STROKE_MATCH_LUCIDE} with h-4 icons to match Lucide. */
  markStrokeWidth?: number
}

export function SiteLogo({
  href,
  className,
  iconClassName,
  textClassName,
  label = "ShrineKeep",
  markStrokeWidth,
}: SiteLogoProps) {
  const inner = (
    <>
      <SiteLogoMark
        strokeWidth={markStrokeWidth}
        className={cn("h-7 w-7 text-foreground", iconClassName)}
      />
      <span className={cn("truncate min-w-0 font-heading font-semibold text-fluid-sm hover:underline flex items-center space-x-1 whitespace-nowrap", textClassName)}>{label}</span>
    </>
  )

  // Match nav links: flex + gap-1 + leading-none; typography on the link (not only the label) for correct line-box alignment.
  const combined = cn(
    "flex items-center gap-1 min-w-0 whitespace-nowrap leading-none text-foreground",
    textClassName,
    className
  )

  if (href) {
    return (
      <Link href={href} className={combined}>
        {inner}
      </Link>
    )
  }

  return <span className={combined}>{inner}</span>
}
