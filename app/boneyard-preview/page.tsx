"use client"

import { Skeleton } from "boneyard-js/react"
import {
  BillingSettingsFixture,
  BoxGridFixture,
  BoxStatsPanelFixture,
  ItemGridCollectionFixture,
  ItemGridWishlistFixture,
} from "@/components/boneyard-fixtures"

/**
 * Public route for `npm run boneyard` — headless capture without auth.
 * @see https://boneyard.vercel.app/install
 */
export default function BoneyardPreviewPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-24 min-w-0">
        <h1 className="sr-only">Boneyard skeleton capture</h1>

        <Skeleton name="box-stats-panel" loading={false} fixture={<BoxStatsPanelFixture />}>
          <div />
        </Skeleton>

        <BoxGridFixture />

        <ItemGridCollectionFixture />

        <ItemGridWishlistFixture />

        <Skeleton name="billing-settings" loading={false} fixture={<BillingSettingsFixture />}>
          <div />
        </Skeleton>
      </div>
    </div>
  )
}
