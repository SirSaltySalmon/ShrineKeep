"use client"

import Link from "next/link"
import BoneyardCardSections from "../card-sections"

/** Compact-density cards, captured as the `*-compact` skeletons. Linked from `/boneyard-preview/1`. */
export default function BoneyardPreviewCompactPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Boneyard Preview — Compact cards</h1>
      <BoneyardCardSections density="compact" />
      <Link href="/boneyard-preview/1" className="text-sm underline underline-offset-4">
        Back to main preview
      </Link>
    </main>
  )
}
