import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { DEMO_TAG_SPECS } from "@/lib/demo/demo-seed-data"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Ensure demo tag names exist for the user; returns stable name → id map for paste payloads. */
export async function ensureDemoTagIds(
  supabase: Supabase,
  userId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const spec of DEMO_TAG_SPECS) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("name", spec.name)
      .maybeSingle()
    if (existing?.id) {
      map.set(spec.name, existing.id)
      continue
    }
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name: spec.name, color: spec.color })
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") {
        const { data: again } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", userId)
          .eq("name", spec.name)
          .single()
        if (again?.id) map.set(spec.name, again.id)
        continue
      }
      throw error
    }
    if (inserted?.id) map.set(spec.name, inserted.id)
  }
  return map
}
