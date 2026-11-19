"use client"

import BoxStatsPanel from "@/components/box-stats-panel"
import ValueGraph from "@/components/value-graph"
import {
  BONEYARD_BOX_STATS_FIXTURE,
  BONEYARD_VALUE_GRAPH_HISTORY_FIXTURE,
} from "@/components/boneyard-stats-fixtures"
import Link from "next/link"
import BoneyardCardSections from "../card-sections"

/**
 * Start URL for `npx boneyard-js build`. The crawler only follows links found on this page,
 * so every other preview page has to be linked from here.
 */
export default function BoneyardPreviewPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Boneyard Preview — Comfortable cards</h1>
      <BoxStatsPanel
        boxId="root"
        boxName="Root"
        previewData={BONEYARD_BOX_STATS_FIXTURE}
      />
      <BoneyardCardSections density="comfortable" />
      <ValueGraph
        itemId="33333333-3333-3333-3333-333333333301"
        previewHistory={BONEYARD_VALUE_GRAPH_HISTORY_FIXTURE}
      />
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/boneyard-preview/2" className="underline underline-offset-4">
          Box stats dialog
        </Link>
        <Link href="/boneyard-preview/3" className="underline underline-offset-4">
          Compact cards
        </Link>
      </nav>
    </main>
  )
}
