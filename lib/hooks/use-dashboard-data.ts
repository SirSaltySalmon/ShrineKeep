"use client"

import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Box, Item, Tag } from "@/lib/types"
import { normalizeItem, sortTagsByColorThenName } from "@/lib/utils"
import {
  countDescendantsById,
  normalizeBox,
  parseOwnerSharingSummary,
  type DashboardOwnerSharing,
} from "@/lib/sharing/box-editor"

interface UseDashboardDataParams {
  userId: string | undefined
  supabase: any
  currentBoxId: string | null
  searchQuery: string
  initialBoxes: Box[]
  initialItems: Item[]
  initialUserTags: Tag[]
  initialDescendantCounts?: Record<string, number>
  initialOwnerSharing?: DashboardOwnerSharing
}

type AffectedBoxInput = string | null | Array<string | null> | undefined

interface BoxesQueryData {
  boxes: Box[]
  descendantCounts: Record<string, number>
}

export function useDashboardData({
  userId,
  supabase,
  currentBoxId,
  searchQuery,
  initialBoxes,
  initialItems,
  initialUserTags,
  initialDescendantCounts = {},
  initialOwnerSharing,
}: UseDashboardDataParams) {
  const queryClient = useQueryClient()
  const trimmedSearch = searchQuery.trim()
  const queryEnabled = Boolean(userId)
  const boxesKey = ["dashboard", "boxes", userId, currentBoxId ?? "root"] as const
  const itemsKey = [
    "dashboard",
    "items",
    userId,
    currentBoxId ?? "root",
    trimmedSearch,
  ] as const
  const unacquiredKey = ["dashboard", "unacquired", userId, currentBoxId ?? "root"] as const
  const tagsKey = ["dashboard", "tags", userId] as const
  const ownerSharingKey = ["dashboard", "owner-sharing", userId] as const
  const toScopeId = (boxId: string | null) => boxId ?? "root"

  const normalizeAffectedBoxes = (affected: AffectedBoxInput): Array<string | null> => {
    if (Array.isArray(affected)) {
      const unique: Array<string | null> = []
      for (const boxId of affected) {
        if (!unique.includes(boxId)) unique.push(boxId)
      }
      return unique
    }
    if (affected === undefined) return []
    return [affected]
  }

  const boxesQuery = useQuery({
    queryKey: boxesKey,
    enabled: queryEnabled,
    initialData: !currentBoxId && !trimmedSearch
      ? { boxes: initialBoxes, descendantCounts: initialDescendantCounts }
      : undefined,
    queryFn: async (): Promise<BoxesQueryData> => {
      let query = supabase.from("boxes").select("*").eq("user_id", userId)
      if (currentBoxId) {
        query = query.eq("parent_box_id", currentBoxId)
      } else {
        query = query.is("parent_box_id", null)
      }
      const [folder, tree] = await Promise.all([
        query.order("position", { ascending: true }),
        supabase.from("boxes").select("id, parent_box_id").eq("user_id", userId),
      ])
      if (folder.error) throw folder.error
      if (tree.error) throw tree.error
      const descendantCounts = countDescendantsById(tree.data ?? [])
      return {
        boxes: (folder.data ?? []).map((row: Box) => normalizeBox(row, descendantCounts)),
        descendantCounts,
      }
    },
  })

  const itemsQuery = useQuery({
    queryKey: itemsKey,
    enabled: queryEnabled,
    initialData: !currentBoxId && !trimmedSearch ? initialItems : undefined,
    queryFn: async (): Promise<Item[]> => {
      let query = supabase
        .from("items")
        .select(`
          *,
          photos (*),
          item_tags (
            tag:tags (*)
          )
        `)
        .eq("user_id", userId)
        .eq("is_wishlist", false)
      if (currentBoxId) {
        query = query.eq("box_id", currentBoxId)
      } else {
        query = query.is("box_id", null)
      }
      if (trimmedSearch) {
        query = query.or(`name.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`)
      }
      const { data, error } = await query.order("position", { ascending: true })
      if (error) throw error
      return (data ?? []).map(normalizeItem)
    },
  })

  const unacquiredQuery = useQuery({
    queryKey: unacquiredKey,
    enabled: queryEnabled && Boolean(currentBoxId),
    queryFn: async (): Promise<Item[]> => {
      if (!currentBoxId) return []
      const { data, error } = await supabase
        .from("items")
        .select(`
          *,
          photos (*),
          item_tags (
            tag:tags (*)
          )
        `)
        .eq("user_id", userId)
        .eq("is_wishlist", true)
        .eq("wishlist_target_box_id", currentBoxId)
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []).map(normalizeItem)
    },
  })

  const tagsQuery = useQuery({
    queryKey: tagsKey,
    enabled: queryEnabled,
    initialData: initialUserTags,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase.from("tags").select("*").eq("user_id", userId)
      if (error) throw error
      return sortTagsByColorThenName(data ?? [])
    },
  })

  const ownerSharingQuery = useQuery({
    queryKey: ownerSharingKey,
    enabled: queryEnabled,
    initialData: initialOwnerSharing,
    queryFn: async (): Promise<DashboardOwnerSharing> => {
      const res = await fetch("/api/settings/profile")
      if (res.status === 404) return { available: false }
      if (!res.ok) throw new Error("Failed to load sharing profile")
      const parsed = parseOwnerSharingSummary(await res.json())
      if (!parsed) throw new Error("Failed to load sharing profile")
      return parsed
    },
  })

  const loading = boxesQuery.isLoading || itemsQuery.isLoading
  const folderLoading =
    boxesQuery.isFetching ||
    itemsQuery.isFetching ||
    unacquiredQuery.isFetching ||
    ownerSharingQuery.isPending

  const setUserTags = (tags: Tag[]) => {
    queryClient.setQueryData(tagsKey, sortTagsByColorThenName(tags))
  }

  const loadBoxes = async (affected: AffectedBoxInput = undefined) => {
    const affectedBoxes = normalizeAffectedBoxes(affected)
    if (affectedBoxes.length === 0) {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "boxes", userId] })
      return
    }

    await Promise.all(
      affectedBoxes.map((boxId) =>
        queryClient.invalidateQueries({
          queryKey: ["dashboard", "boxes", userId, toScopeId(boxId)],
        })
      )
    )
  }

  const loadItems = async (affected: AffectedBoxInput = undefined) => {
    const affectedBoxes = normalizeAffectedBoxes(affected)
    if (affectedBoxes.length === 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "items", userId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "unacquired", userId] }),
      ])
      return
    }

    await Promise.all(
      affectedBoxes.map((boxId) => {
        const scopeId = toScopeId(boxId)
        return Promise.all([
          queryClient.invalidateQueries({
            predicate: (query) => {
              const queryKey = query.queryKey
              return (
                Array.isArray(queryKey) &&
                queryKey[0] === "dashboard" &&
                queryKey[1] === "items" &&
                queryKey[2] === userId &&
                queryKey[3] === scopeId
              )
            },
          }),
          queryClient.invalidateQueries({
            queryKey: ["dashboard", "unacquired", userId, scopeId],
          }),
        ])
      })
    )
  }

  const setUnacquiredItems = (next: Item[]) => {
    queryClient.setQueryData(unacquiredKey, next)
  }

  const refreshOwnerSharing = async () => {
    await queryClient.invalidateQueries({ queryKey: ownerSharingKey })
  }

  const setOwnerSharing = (next: DashboardOwnerSharing) => {
    queryClient.setQueryData(ownerSharingKey, next)
  }

  const descendantCounts = boxesQuery.data?.descendantCounts ?? initialDescendantCounts

  const boxes = useMemo(
    () => boxesQuery.data?.boxes ?? [],
    [boxesQuery.data?.boxes],
  )

  return {
    boxes,
    descendantCounts,
    ownerSharing: ownerSharingQuery.data,
    items: itemsQuery.data ?? [],
    unacquiredItems: currentBoxId ? unacquiredQuery.data ?? [] : [],
    setUnacquiredItems,
    userTags: tagsQuery.data ?? [],
    setUserTags,
    loading,
    folderLoading,
    loadBoxes,
    loadItems,
    refreshOwnerSharing,
    setOwnerSharing,
  }
}
