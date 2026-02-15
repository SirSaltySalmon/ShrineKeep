"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item, Tag } from "@/lib/types"
import {
  DEFAULT_SEARCH_FILTERS,
  hasAnySearchFilter,
  type SearchFiltersState,
} from "@/lib/types"
import {
  normalizeItem,
  sortTagsByColorThenName,
  buildSearchUrl as buildSearchUrlUtil,
} from "@/lib/utils"
import AdvancedSearchFilters from "@/components/advanced-search-filters"
import ItemCard from "@/components/item-card"
import ItemDialog from "@/components/item-dialog"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ChevronLeft, ChevronRight, Filter, X } from "lucide-react"

const PER_PAGE = 10

function filtersFromSearchParams(searchParams: URLSearchParams): SearchFiltersState {
  return {
    includeTags: searchParams.get("includeTags")?.split(",").filter(Boolean) ?? [],
    excludeTags: searchParams.get("excludeTags")?.split(",").filter(Boolean) ?? [],
    valueMin: searchParams.get("valueMin") ?? "",
    valueMax: searchParams.get("valueMax") ?? "",
    acquisitionMin: searchParams.get("acquisitionMin") ?? "",
    acquisitionMax: searchParams.get("acquisitionMax") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    tagColors: searchParams.get("tagColors")?.split(",").filter(Boolean) ?? [],
  }
}

interface SearchResultsClientProps {
  user: { id: string } | null
  initialQuery: string
  initialIncludeTags?: string[]
  initialExcludeTags?: string[]
  initialValueMin?: string
  initialValueMax?: string
  initialAcquisitionMin?: string
  initialAcquisitionMax?: string
  initialDateFrom?: string
  initialDateTo?: string
  initialTagColors?: string[]
}

export default function SearchResultsClient({
  user,
  initialQuery,
  initialIncludeTags = [],
  initialExcludeTags = [],
  initialValueMin = "",
  initialValueMax = "",
  initialAcquisitionMin = "",
  initialAcquisitionMax = "",
  initialDateFrom = "",
  initialDateTo = "",
  initialTagColors = [],
}: SearchResultsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createSupabaseClient()

  const q = searchParams.get("q") ?? initialQuery
  const [filters, setFilters] = useState<SearchFiltersState>(() => ({
    includeTags: initialIncludeTags,
    excludeTags: initialExcludeTags,
    valueMin: initialValueMin,
    valueMax: initialValueMax,
    acquisitionMin: initialAcquisitionMin,
    acquisitionMax: initialAcquisitionMax,
    dateFrom: initialDateFrom,
    dateTo: initialDateTo,
    tagColors: initialTagColors,
  }))
  const [showFilters, setShowFilters] = useState(false)

  // Sync filter state from URL when params change (e.g. back/forward)
  useEffect(() => {
    setFilters(filtersFromSearchParams(searchParams))
  }, [searchParams])

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [userTags, setUserTags] = useState<Tag[]>([])
  const { copied } = useCopiedItem()
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const scrollYRef = useRef(0)
  const [pageInputValue, setPageInputValue] = useState("")

  const hasAnyFilter = hasAnySearchFilter(filters)

  const pushFiltersToUrl = useCallback(
    (newFilters: SearchFiltersState, page?: number) => {
      router.push(buildSearchUrlUtil(q, newFilters, page ?? 1), { scroll: false })
    },
    [q, router]
  )

  /** Build search URL with a specific page (keeps current q and filters). */
  const buildPageUrl = useCallback(
    (pageNum: number) => buildSearchUrlUtil(q, filters, pageNum),
    [q, filters]
  )

  const handleFiltersChange = useCallback((newFilters: SearchFiltersState) => {
    setFilters(newFilters)
  }, [])

  const handleApplyFilters = useCallback(
    (newFilters?: SearchFiltersState) => {
      if (newFilters) setFilters(newFilters)
      pushFiltersToUrl(newFilters ?? filters)
    },
    [filters, pushFiltersToUrl]
  )

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_SEARCH_FILTERS)
    router.push(buildSearchUrlUtil(q, DEFAULT_SEARCH_FILTERS, 1), { scroll: false })
  }, [q, router])

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    scrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0
    setLoading(true)
    let query = supabase
      .from("items")
      .select(
        `
        *,
        photos (*),
        item_tags (
          tag:tags (*)
        )
      `
      )
      .eq("user_id", user.id)
      .eq("is_wishlist", false)

    const queryText = (q || "").trim()
    if (queryText) {
      query = query.or(`name.ilike.%${queryText}%,description.ilike.%${queryText}%`)
    }
    query = query.order("position", { ascending: true })

    query.then(({ data, error }) => {
      if (error) {
        console.error("Error searching items:", error)
        setItems([])
        setLoading(false)
        return
      }
      let list = (data || []).map(normalizeItem) as Item[]

      const numValueMin = filters.valueMin !== "" ? parseFloat(filters.valueMin) : null
      const numValueMax = filters.valueMax !== "" ? parseFloat(filters.valueMax) : null
      const numAcqMin = filters.acquisitionMin !== "" ? parseFloat(filters.acquisitionMin) : null
      const numAcqMax = filters.acquisitionMax !== "" ? parseFloat(filters.acquisitionMax) : null

      if (numValueMin != null && !Number.isNaN(numValueMin)) {
        list = list.filter((i) => i.current_value != null && i.current_value >= numValueMin)
      }
      if (numValueMax != null && !Number.isNaN(numValueMax)) {
        list = list.filter((i) => i.current_value != null && i.current_value <= numValueMax)
      }
      if (numAcqMin != null && !Number.isNaN(numAcqMin)) {
        list = list.filter((i) => i.acquisition_price != null && i.acquisition_price >= numAcqMin)
      }
      if (numAcqMax != null && !Number.isNaN(numAcqMax)) {
        list = list.filter((i) => i.acquisition_price != null && i.acquisition_price <= numAcqMax)
      }
      if (filters.dateFrom) {
        list = list.filter((i) => i.acquisition_date != null && i.acquisition_date >= filters.dateFrom)
      }
      if (filters.dateTo) {
        list = list.filter((i) => i.acquisition_date != null && i.acquisition_date <= filters.dateTo)
      }
      if (filters.includeTags.length > 0) {
        const includeSet = new Set(filters.includeTags)
        list = list.filter((i) => i.tags?.some((t) => includeSet.has(t.id)))
      }
      if (filters.excludeTags.length > 0) {
        const excludeSet = new Set(filters.excludeTags)
        list = list.filter((i) => !i.tags?.some((t) => excludeSet.has(t.id)))
      }
      if (filters.tagColors.length > 0) {
        const colorSet = new Set(filters.tagColors)
        list = list.filter((i) => i.tags?.some((t) => colorSet.has((t as Tag).color ?? "")))
      }

      setItems(list)
      setLoading(false)
      const savedY = scrollYRef.current
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (typeof window !== "undefined") window.scrollTo(0, savedY)
        })
      })
    })
  }, [
    user?.id,
    q,
    filters.valueMin,
    filters.valueMax,
    filters.acquisitionMin,
    filters.acquisitionMax,
    filters.dateFrom,
    filters.dateTo,
    filters.includeTags.join(","),
    filters.excludeTags.join(","),
    filters.tagColors.join(","),
  ])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from("tags")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => setUserTags(sortTagsByColorThenName(data ?? [])))
  }, [user?.id, supabase])

  const handleItemClick = (item: Item, e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    setSelectedIds(new Set())
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  const selectedItems = items.filter((i) => selectedIds.has(i.id))

  const handleSave = () => {
    if (!user?.id) return
    setLoading(true)
    let query = supabase
      .from("items")
      .select(
        `
        *,
        photos (*),
        item_tags (
          tag:tags (*)
        )
      `
      )
      .eq("user_id", user.id)
      .eq("is_wishlist", false)
    const queryText = (q || "").trim()
    if (queryText) query = query.or(`name.ilike.%${queryText}%,description.ilike.%${queryText}%`)
    query = query.order("position", { ascending: true })
    query.then(({ data, error }) => {
      if (!error) {
        let list = (data || []).map(normalizeItem) as Item[]
        const numValueMin = filters.valueMin !== "" ? parseFloat(filters.valueMin) : null
        const numValueMax = filters.valueMax !== "" ? parseFloat(filters.valueMax) : null
        const numAcqMin = filters.acquisitionMin !== "" ? parseFloat(filters.acquisitionMin) : null
        const numAcqMax = filters.acquisitionMax !== "" ? parseFloat(filters.acquisitionMax) : null
        if (numValueMin != null && !Number.isNaN(numValueMin)) list = list.filter((i) => i.current_value != null && i.current_value >= numValueMin)
        if (numValueMax != null && !Number.isNaN(numValueMax)) list = list.filter((i) => i.current_value != null && i.current_value <= numValueMax)
        if (numAcqMin != null && !Number.isNaN(numAcqMin)) list = list.filter((i) => i.acquisition_price != null && i.acquisition_price >= numAcqMin)
        if (numAcqMax != null && !Number.isNaN(numAcqMax)) list = list.filter((i) => i.acquisition_price != null && i.acquisition_price <= numAcqMax)
        if (filters.dateFrom) list = list.filter((i) => i.acquisition_date != null && i.acquisition_date >= filters.dateFrom)
        if (filters.dateTo) list = list.filter((i) => i.acquisition_date != null && i.acquisition_date <= filters.dateTo)
        if (filters.includeTags.length > 0) {
          const includeSet = new Set(filters.includeTags)
          list = list.filter((i) => i.tags?.some((t) => includeSet.has(t.id)))
        }
        if (filters.excludeTags.length > 0) {
          const excludeSet = new Set(filters.excludeTags)
          list = list.filter((i) => !i.tags?.some((t) => excludeSet.has(t.id)))
        }
        if (filters.tagColors.length > 0) {
          const colorSet = new Set(filters.tagColors)
          list = list.filter((i) => i.tags?.some((t) => colorSet.has((t as Tag).color ?? "")))
        }
        setItems(list)
      }
      setLoading(false)
    })
  }

  const filterCount =
    filters.includeTags.length +
    filters.excludeTags.length +
    filters.tagColors.length +
    (filters.valueMin ? 1 : 0) +
    (filters.valueMax ? 1 : 0) +
    (filters.acquisitionMin ? 1 : 0) +
    (filters.acquisitionMax ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE))
  const pageParam = searchParams.get("page")
  const currentPage = Math.min(
    Math.max(parseInt(pageParam || "1", 10) || 1, 1),
    totalPages
  )
  const paginatedItems = items.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)

  const goToPage = useCallback(
    (pageNum: number) => {
      const p = Math.min(Math.max(1, pageNum), totalPages)
      router.push(buildPageUrl(p), { scroll: false })
      setPageInputValue("")
    },
    [totalPages, buildPageUrl, router]
  )

  return (
    <main className="container mx-auto px-4 py-8 layout-shrink-visible">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-fluid-sm text-muted-foreground hover:text-foreground mb-6 min-w-0"
      >
        <ArrowLeft className="h-4 w-4 mr-1 shrink-0" />
        Back to Collections
      </Link>
      <div className="flex flex-wrap items-center gap-4 mb-4 min-w-0">
        <h1 className="text-fluid-2xl font-semibold truncate min-w-0">
          {q?.trim() ? `Search: "${q}"` : "Search"}
        </h1>
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="h-4 w-4 mr-1" />
          Filters {hasAnyFilter ? `(${filterCount})` : ""}
        </Button>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {showFilters && (
        <AdvancedSearchFilters
          filters={filters}
          userTags={userTags}
          onFiltersChange={handleFiltersChange}
          onApply={handleApplyFilters}
          showClear={hasAnyFilter}
          onClear={clearFilters}
          className="mb-6"
        />
      )}

      <p className="text-fluid-sm text-muted-foreground mb-4 min-w-0">
        {loading
          ? "Loading..."
          : items.length === 0
            ? "No items match your search."
            : totalPages > 1
              ? `${totalItems} item${totalItems === 1 ? "" : "s"} found (page ${currentPage} of ${totalPages})`
              : `${totalItems} item${totalItems === 1 ? "" : "s"} found`}
      </p>
      {loading ? (
        <div className="text-center py-12 text-fluid-sm text-muted-foreground min-w-0">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-fluid-sm text-muted-foreground min-w-0">No items match your search.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {paginatedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                variant="collection"
                selected={selectedIds.has(item.id)}
                onClick={handleItemClick}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="flex flex-wrap items-center justify-center gap-3 py-4 border-t min-w-0" aria-label="Pagination">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="shrink-0"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-fluid-sm text-muted-foreground">Page</span>
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInputValue !== "" ? pageInputValue : String(currentPage)}
                  onChange={(e) => setPageInputValue(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => {
                    const n = parseInt(pageInputValue, 10)
                    if (!Number.isNaN(n)) goToPage(n)
                    else setPageInputValue("")
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(pageInputValue, 10)
                      if (!Number.isNaN(n)) goToPage(n)
                      setPageInputValue("")
                    }
                  }}
                  className="w-14 text-center text-fluid-sm"
                  aria-label="Page number"
                />
                <span className="text-fluid-sm text-muted-foreground">of {totalPages}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="shrink-0"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </nav>
          )}
        </>
      )}
      {(selectedItems.length > 0 || (copied !== null && copied.length > 0)) && (
        <SelectionActionBar
          selectedItems={selectedItems}
          pasteTarget={
            selectedItems[0]
              ? { boxId: selectedItems[0].box_id ?? null, isWishlist: false }
              : null
          }
          onDeleteDone={handleSave}
          onPasteDone={handleSave}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}
      <ItemDialog
        open={showItemDialog}
        onOpenChange={setShowItemDialog}
        item={selectedItem}
        isNew={false}
        boxId={selectedItem?.box_id ?? null}
        onSave={handleSave}
      />
    </main>
  )
}
