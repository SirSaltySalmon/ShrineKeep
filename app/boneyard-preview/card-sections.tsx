"use client"

import BoxGrid from "@/components/box-grid"
import ItemGrid from "@/components/item-grid"
import ItemCard from "@/components/item-card"
import { OWNER_CAPABILITIES } from "@/lib/sharing/presentation/capabilities"
import { presentOwnerItem } from "@/lib/sharing/presentation/adapters"
import { Skeleton } from "boneyard-js/react"
import {
  BOX_SKELETON_FIXTURES,
  COLLECTION_ITEM_SKELETON_FIXTURES,
  WISHLIST_ITEM_SKELETON_FIXTURES,
} from "@/components/boneyard-fixtures"
import { ITEM_GRID_LAYOUT, getCardSkeletonName, type CardDensity } from "@/lib/card-density"
import { CardDensityOverride } from "@/lib/hooks/use-card-density"

/**
 * The card skeletons that differ by density: box cards, collection and wishlist item cards,
 * and search result cards. Rendered once per density (`/boneyard-preview/1` comfortable,
 * `/boneyard-preview/3` compact) in the same grids the app uses, so each card is captured
 * at the width it really has at every breakpoint.
 */
export default function BoneyardCardSections({ density }: { density: CardDensity }) {
  return (
    <CardDensityOverride value={density}>
      <BoxGrid
        boxes={BOX_SKELETON_FIXTURES}
        currentBoxId={null}
        onBoxClick={() => {}}
        onRename={() => {}}
        onShowStats={() => {}}
        onCreateBox={async () => {}}
        toggleBoxSelection={() => {}}
      />
      <ItemGrid
        items={COLLECTION_ITEM_SKELETON_FIXTURES}
        currentBoxId={null}
        onItemUpdate={() => {}}
        sectionTitle="Items"
        totalItemCount={12}
        itemCap={50}
        isPro={false}
      />
      <ItemGrid
        items={WISHLIST_ITEM_SKELETON_FIXTURES}
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
        <div className={ITEM_GRID_LAYOUT[density].gridClass}>
          {COLLECTION_ITEM_SKELETON_FIXTURES.map((item) => {
            const card = (
              <ItemCard
                item={presentOwnerItem(item)}
                variant="collection"
                capabilities={OWNER_CAPABILITIES}
                density={density}
                onClick={() => {}}
              />
            )
            return (
              <Skeleton
                key={item.id}
                name={getCardSkeletonName("search-results-card", density)}
                loading
                animate="shimmer"
                color="hsl(var(--muted))"
                darkColor="hsl(var(--muted))"
                fixture={card}
              >
                {card}
              </Skeleton>
            )
          })}
        </div>
      </section>
    </CardDensityOverride>
  )
}
