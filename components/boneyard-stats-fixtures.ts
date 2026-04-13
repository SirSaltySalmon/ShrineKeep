import type { AcquisitionChartPoint, ValueChartPoint } from "@/lib/hooks/use-box-stats"
import type { ValueHistory } from "@/lib/types"
import {
  DEMO_COLLECTION_ITEM_IDS,
  DEMO_COLLECTION_ITEM_SPECS,
} from "@/lib/demo/demo-seed-data"

export interface BoneyardBoxStatsFixture {
  currentValue: number
  totalAcquisition: number
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
}

type HistoryPoint = { date: string; value: number }

function toIsoDate(input: string): string {
  return input.slice(0, 10)
}

function buildValueChartData(): ValueChartPoint[] {
  const allDates = Array.from(
    new Set(
      DEMO_COLLECTION_ITEM_SPECS.flatMap((spec) =>
        spec.value_history.map((h) => toIsoDate(h.recorded_at))
      )
    )
  ).sort()

  return allDates.map((date) => {
    const totalValue = DEMO_COLLECTION_ITEM_SPECS.reduce((sum, spec) => {
      const history: HistoryPoint[] = spec.value_history
        .map((h) => ({ date: toIsoDate(h.recorded_at), value: h.value }))
        .sort((a, b) => a.date.localeCompare(b.date))
      const latestAtDate = history.reduce<number | null>(
        (latest, point) => (point.date <= date ? point.value : latest),
        null
      )
      return sum + (latestAtDate ?? 0)
    }, 0)
    return { date, value: Number(totalValue.toFixed(2)) }
  })
}

function buildAcquisitionChartData(dates: readonly string[]): AcquisitionChartPoint[] {
  return dates.map((date) => {
    const cumulativeAcquisition = DEMO_COLLECTION_ITEM_SPECS.reduce(
      (sum, spec) => sum + (spec.acquisition_date <= date ? spec.acquisition_price : 0),
      0
    )
    return {
      date,
      cumulativeAcquisition: Number(cumulativeAcquisition.toFixed(2)),
    }
  })
}

const valueChartData = buildValueChartData()
const acquisitionChartData = buildAcquisitionChartData(valueChartData.map((p) => p.date))

export const BONEYARD_BOX_STATS_FIXTURE: BoneyardBoxStatsFixture = {
  currentValue: Number(
    DEMO_COLLECTION_ITEM_SPECS.reduce((sum, spec) => sum + spec.current_value, 0).toFixed(2)
  ),
  totalAcquisition: Number(
    DEMO_COLLECTION_ITEM_SPECS.reduce((sum, spec) => sum + spec.acquisition_price, 0).toFixed(2)
  ),
  valueChartData,
  acquisitionChartData,
}

export const BONEYARD_VALUE_GRAPH_HISTORY_FIXTURE: ValueHistory[] =
  DEMO_COLLECTION_ITEM_SPECS[0]!.value_history.map((point, i) => ({
    id: `77777777-7777-7777-7777-${String(i + 1).padStart(12, "0")}`,
    item_id: DEMO_COLLECTION_ITEM_IDS[0]!,
    value: point.value,
    recorded_at: point.recorded_at,
  }))
