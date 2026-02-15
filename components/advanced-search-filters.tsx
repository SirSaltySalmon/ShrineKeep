"use client"

import { Tag, TAG_COLORS, type SearchFiltersState, type TagColor } from "@/lib/types"
import { getTagChipStyle } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export interface AdvancedSearchFiltersProps {
  filters: SearchFiltersState
  userTags: Tag[]
  onFiltersChange: (filters: SearchFiltersState) => void
  /** Called when URL should be updated (blur on inputs, or tag/color toggle). Pass new filters when known (e.g. tag click); parent may use its state for blur. */
  onApply?: (filters?: SearchFiltersState) => void
  showClear?: boolean
  onClear?: () => void
  className?: string
}

export default function AdvancedSearchFilters({
  filters,
  userTags,
  onFiltersChange,
  onApply,
  showClear = true,
  onClear,
  className,
}: AdvancedSearchFiltersProps) {
  const update = (patch: Partial<SearchFiltersState> | SearchFiltersState) => {
    const next: SearchFiltersState =
      "includeTags" in patch && "valueMin" in patch && "tagColors" in patch
        ? (patch as SearchFiltersState)
        : { ...filters, ...patch }
    onFiltersChange(next)
  }

  const handleBlur = () => {
    onApply?.()
  }

  const toggleIncludeTag = (tagId: string) => {
    const next = filters.includeTags.includes(tagId)
      ? filters.includeTags.filter((id) => id !== tagId)
      : [...filters.includeTags, tagId]
    const nextFilters = { ...filters, includeTags: next }
    update(nextFilters)
    onApply?.(nextFilters)
  }

  const toggleExcludeTag = (tagId: string) => {
    const next = filters.excludeTags.includes(tagId)
      ? filters.excludeTags.filter((id) => id !== tagId)
      : [...filters.excludeTags, tagId]
    const nextFilters = { ...filters, excludeTags: next }
    update(nextFilters)
    onApply?.(nextFilters)
  }

  const toggleTagColor = (color: string) => {
    const next = filters.tagColors.includes(color)
      ? filters.tagColors.filter((c) => c !== color)
      : [...filters.tagColors, color]
    const nextFilters = { ...filters, tagColors: next }
    update(nextFilters)
    onApply?.(nextFilters)
  }

  return (
    <div className={className}>
      <div className="rounded-lg border bg-muted/30 p-4 space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-fluid-xs">Value min</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0"
              value={filters.valueMin}
              onChange={(e) => update({ valueMin: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-fluid-xs">Value max</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Any"
              value={filters.valueMax}
              onChange={(e) => update({ valueMax: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-fluid-xs">Acquisition cost min</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0"
              value={filters.acquisitionMin}
              onChange={(e) => update({ acquisitionMin: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-fluid-xs">Acquisition cost max</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Any"
              value={filters.acquisitionMax}
              onChange={(e) => update({ acquisitionMax: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-fluid-xs">Acquisition date from</Label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-fluid-xs">Acquisition date to</Label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              onBlur={handleBlur}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-fluid-xs">Include tags (item has any)</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {userTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleIncludeTag(t.id)}
                className={`rounded-md px-2 py-0.5 text-fluid-xs font-medium ${filters.includeTags.includes(t.id) ? "ring-2 ring-primary" : ""}`}
                style={getTagChipStyle(t.color ?? "blue")}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-fluid-xs">Exclude tags (item has none)</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {userTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleExcludeTag(t.id)}
                className={`rounded-md px-2 py-0.5 text-fluid-xs font-medium border ${filters.excludeTags.includes(t.id) ? "ring-2 ring-destructive" : ""}`}
                style={{ borderColor: `hsl(var(--tag-${t.color ?? "blue"}))` }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-fluid-xs">Tag colors (item has a tag of this color)</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(TAG_COLORS as readonly string[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleTagColor(c)}
                className={`rounded-md px-2 py-1 text-fluid-xs font-medium ${filters.tagColors.includes(c) ? "ring-2 ring-primary" : ""}`}
                style={getTagChipStyle(c as TagColor)}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {showClear && onClear && (
          <div className="pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
