"use client"

import Image from "next/image"
import { useState } from "react"

// Next.js serves files from public/ at the root. Use /hero.jpeg or /hero.png (file must live in public/)
const HERO_SOURCES = ["/hero.jpeg", "/hero2.jpeg"]

export function LandingHeroImage({ src_index = 0 }: { src_index?: number }) {
  const src = HERO_SOURCES[src_index]

  if (!src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-fluid-lg px-4 text-center">
        Dashboard preview — add hero.jpeg or hero2.jpeg to the public folder
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt="ShrineKeep Dashboard"
      fill
      className="object-cover"
      sizes="(max-width: 761px) 1649px, 761px"
      unoptimized
    />
  )
}
