import { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function getOwnedBoxIdSet(
  supabase: Supabase,
  userId: string,
  boxIds: string[]
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(boxIds.filter(Boolean)))
  if (uniqueIds.length === 0) return new Set<string>()

  const { data, error } = await supabase
    .from("boxes")
    .select("id")
    .in("id", uniqueIds)
    .eq("user_id", userId)

  if (error) throw error
  return new Set((data ?? []).map((row) => row.id))
}
