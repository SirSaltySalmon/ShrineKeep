"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DateRangeFilter } from "@/components/date-range-filter"
import { BoxStatsPresentation } from "@/components/box-stats-presentation"
import { presentPublicBoxStats } from "@/lib/sharing/presentation/adapters"
import { sharingKeys } from "@/lib/sharing/cache-keys"
import { fetchPublicStats, PublicReadError, describePublicReadError } from "@/lib/sharing/client/public-reads"
import type { PublishedViewer } from "@/lib/sharing/contracts"

export function PublicBoxStatsDialog({
  open,
  onOpenChange,
  ownerId,
  viewer,
  boxId,
  boxName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerId: string
  viewer: PublishedViewer
  boxId: string | null
  boxName: string
}) {
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const stats = useQuery({
    queryKey: sharingKeys.public(ownerId, viewer, {
      surface: "stats",
      boxId: boxId ?? undefined,
      filters: { fromDate: fromDate || null, toDate: toDate || null },
    }),
    queryFn: () => fetchPublicStats(ownerId, {
      boxId: boxId ?? undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0">
        <DialogHeader>
          <DialogTitle>{boxName}</DialogTitle>
          <DialogDescription>Value and acquisition over the visible collection.</DialogDescription>
        </DialogHeader>
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onApplyRange={(from, to) => {
            setFromDate(from)
            setToDate(to)
          }}
          onReset={() => {
            setFromDate("")
            setToDate("")
          }}
        />
        {stats.isLoading ? <p className="text-fluid-sm text-muted-foreground">Loading…</p> : null}
        {stats.error ? (
          <p className="text-fluid-sm text-destructive">
            {stats.error instanceof PublicReadError ? describePublicReadError(stats.error.error) : "Something went wrong. Try again."}
          </p>
        ) : null}
        {stats.data ? (
          <BoxStatsPresentation
            stats={presentPublicBoxStats(stats.data)}
            variant="cards"
            tooltipInModal
            fromDate={fromDate || undefined}
            toDate={toDate || undefined}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
