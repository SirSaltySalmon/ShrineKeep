import type { TagColor } from "@/lib/types"
import type { AcquisitionChartPoint, ValueChartPoint } from "@/lib/hooks/use-box-stats"

/** Card/detail tag chip. Public adapters must leave this empty. */
export interface PresentedTag {
  id: string
  name: string
  color: TagColor
}

/** Shared box card model. Owner-only totals are omitted (undefined), not zeroed, when hidden. */
export interface PresentedBox {
  id: string
  name: string
  description: string | null
  totalValue?: number
  totalAcquisitionCost?: number
  itemCount?: number
}

/** Shared item card model. Public adapters never populate tags. */
export interface PresentedItem {
  id: string
  name: string
  description: string | null
  thumbnailUrl: string | null
  currentValue: number | null
  acquisitionPrice: number | null
  acquisitionDate: string | null
  expectedPrice: number | null
  visibleTargetName: string | null
  tags: PresentedTag[]
}

export interface PresentedItemDetail {
  item: PresentedItem
  photos: Array<{ url: string; alt: string }>
}

export interface PresentedBoxStats {
  currentValue: number
  totalAcquisition: number
  profit: number
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
}
