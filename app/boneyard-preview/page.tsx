"use client"

import BoxGrid from "@/components/box-grid"
import ItemGrid from "@/components/item-grid"
import BoxStatsPanel from "@/components/box-stats-panel"
import BoxStatsDialog from "@/components/box-stats-dialog"
import ValueGraph from "@/components/value-graph"
import ItemCard from "@/components/item-card"
import { Skeleton } from "boneyard-js/react"
import { COLLECTION_ITEM_SKELETON_FIXTURES } from "@/components/boneyard-fixtures"

export default function BoneyardPreviewPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Boneyard Preview</h1>
      <BoxStatsPanel boxId="root" boxName="Root" forceLoading />
      <BoxGrid
        loading
        boxes={[]}
        currentBoxId={null}
        onBoxClick={() => {}}
        onRename={() => {}}
        onShowStats={() => {}}
        onCreateBox={async () => {}}
        toggleBoxSelection={() => {}}
      />
      <ItemGrid
        loading
        items={[]}
        currentBoxId={null}
        onItemUpdate={() => {}}
        sectionTitle="Items"
        totalItemCount={12}
        itemCap={50}
        isPro={false}
      />
      <ItemGrid
        loading
        items={[]}
        currentBoxId={null}
        onItemUpdate={() => {}}
        sectionTitle="Wishlist"
        variant="wishlist"
        addButtonLabel="Add to Wishlist"
        totalItemCount={12}
        itemCap={50}
        isPro={false}
      />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Search Results</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {COLLECTION_ITEM_SKELETON_FIXTURES.map((item) => (
            <Skeleton
              key={item.id}
              name="search-results-card"
              loading
              animate="shimmer"
              color="hsl(var(--muted))"
              darkColor="hsl(var(--muted))"
              fixture={<ItemCard item={item} variant="collection" onClick={() => {}} />}
            >
              <ItemCard item={item} variant="collection" onClick={() => {}} />
            </Skeleton>
          ))}
        </div>
      </section>
      <ValueGraph itemId="33333333-3333-3333-3333-333333333301" forceLoading />
    </main>
  )
}
