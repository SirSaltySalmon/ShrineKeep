"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBoxStats } from "@/lib/hooks/use-box-stats"
import { BoxStatsSummary, BoxStatsCharts } from "@/components/box-stats-content"

interface BoxStatsDialogProps {
  boxId: string
  boxName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function BoxStatsDialog({
  boxId,
  boxName,
  open,
  onOpenChange,
}: BoxStatsDialogProps) {
  const {
    currentValue,
    totalAcquisition,
    profit,
    valueChartData,
    acquisitionChartData,
    loading,
  } = useBoxStats(boxId, { enabled: open })

  const scopeLabel = boxId === "root" ? "Root" : "Box"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle title={`${scopeLabel}: ${boxName}`}>
            {scopeLabel}: {boxName}
          </DialogTitle>
          <DialogDescription>
            Total value and cumulative acquisition cost over time (includes all items in this scope and sub-boxes).
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-fluid-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6 py-4">
            <BoxStatsSummary
              currentValue={currentValue}
              totalAcquisition={totalAcquisition}
              profit={profit}
              variant="cards"
            />
            <BoxStatsCharts
              valueChartData={valueChartData}
              acquisitionChartData={acquisitionChartData}
              tooltipInModal
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
