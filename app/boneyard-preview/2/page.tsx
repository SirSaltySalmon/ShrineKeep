"use client"

import BoxStatsDialog from "@/components/box-stats-dialog"
import { BOX_SKELETON_FIXTURES } from "@/components/boneyard-fixtures"
import { BONEYARD_BOX_STATS_FIXTURE } from "@/components/boneyard-stats-fixtures"
import Link from "next/link"

const previewBox = BOX_SKELETON_FIXTURES[0]!

export default function BoneyardPreviewBoxStatsDialogPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Boneyard Preview — Box stats dialog</h1>
      <p className="text-sm text-muted-foreground">
        Dialog stays open with local demo stats so the boneyard crawler can capture{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">box-stats-dialog</code>.
      </p>
      <BoxStatsDialog
        boxId={previewBox.id}
        boxName={previewBox.name}
        open
        previewData={BONEYARD_BOX_STATS_FIXTURE}
        onOpenChange={() => {}}
      />
      <Link href="/boneyard-preview/1" className="text-sm underline underline-offset-4">
        Back to main preview
      </Link>
    </main>
  )
}
