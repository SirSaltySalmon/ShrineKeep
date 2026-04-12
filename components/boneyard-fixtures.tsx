"use client"

import { useState } from "react"
import { DndContext, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { NonTouchPointerSensor } from "@/lib/non-touch-pointer-sensor"
import { Button } from "@/components/ui/button"
import BoxGrid from "@/components/box-grid"
import ItemGrid from "@/components/item-grid"
import { Sparkle } from "lucide-react"
import { proUpgradeCtaLabel } from "@/lib/subscription"
import {
  MOCK_BOXES,
  MOCK_DASHBOARD_ITEMS,
  MOCK_WISHLIST_ITEMS,
} from "@/lib/boneyard-mock-data"

const noop = () => {}
const noopAsync = async () => {}

function useFixtureSensors() {
  return useSensors(
    useSensor(NonTouchPointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )
}

export function BoxStatsPanelFixture() {
  return (
    <div className="rounded-lg border bg-card mb-6 overflow-visible min-w-0">
      <div className="p-4 layout-shrink-visible">
        <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 min-w-0 overflow-auto">
            <div className="min-w-0">
              <p className="text-fluid-xs text-muted-foreground">Current value</p>
              <p className="text-fluid-lg font-semibold tabular-nums">$1,248</p>
            </div>
            <div className="min-w-0">
              <p className="text-fluid-xs text-muted-foreground">Acquisition cost</p>
              <p className="text-fluid-lg font-semibold tabular-nums">$920</p>
            </div>
            <div className="min-w-0">
              <p className="text-fluid-xs text-muted-foreground">Profit / loss</p>
              <p className="text-fluid-lg font-semibold tabular-nums text-emerald-600">+$328</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" type="button" onClick={noop}>
            Expand
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BoxGridFixture() {
  return (
    <BoxGrid
      boxes={MOCK_BOXES}
      currentBoxId={MOCK_BOXES[0]?.id ?? null}
      onBoxClick={noop}
      onRename={() => noop()}
      onShowStats={() => noop()}
      onCreateBox={noopAsync}
      isBoxSelected={() => false}
      toggleBoxSelection={noop}
      selectionMode={false}
      onEnterSelectionMode={noop}
      registerBoxCardRef={noop}
      loading={false}
    />
  )
}

export function ItemGridCollectionFixture() {
  const sensors = useFixtureSensors()
  return (
    <DndContext sensors={sensors} onDragEnd={noop}>
      <ItemGrid
        items={MOCK_DASHBOARD_ITEMS}
        currentBoxId={MOCK_BOXES[0]?.id ?? null}
        onItemUpdate={noop}
        sectionTitle="Items"
        selectionMode={false}
        onEnterSelectionMode={noop}
        totalItemCount={12}
        itemCap={50}
        isPro={false}
        loading={false}
      />
    </DndContext>
  )
}

export function ItemGridWishlistFixture() {
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>())
  return (
    <ItemGrid
      items={MOCK_WISHLIST_ITEMS}
      currentBoxId={null}
      onItemUpdate={noop}
      sectionTitle="Wishlist"
      sectionIcon={Sparkle}
      addButtonLabel="Add to Wishlist"
      variant="wishlist"
      emptyText="Your wishlist is empty."
      onMarkAcquired={noop}
      wishlistDialogLocked
      selectionMode={false}
      selectionProps={{
        selectedIds,
        setSelectedIds,
        registerCardRef: noop,
      }}
      loading={false}
    />
  )
}

export function BillingSettingsFixture() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-fluid-xl font-semibold mb-1">Billing</h2>
        <p className="text-fluid-sm text-muted-foreground">Manage your ShrineKeep subscription.</p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-fluid-sm font-medium">Free plan</p>
            <p className="text-fluid-xs text-muted-foreground mt-0.5">12 of 50 items used</p>
          </div>
          <Button type="button" onClick={noop}>
            {proUpgradeCtaLabel()}
          </Button>
        </div>
      </div>

      <div className="text-fluid-sm text-muted-foreground space-y-1">
        <p>Pro includes:</p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>Unlimited items</li>
          <li>eBay price lookup (coming soon)</li>
        </ul>
      </div>
    </div>
  )
}
