import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import SearchResultsClient from "./search-results-client"

export default async function DashboardSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user.id)
    .single()

  const { q } = await searchParams

  return <SearchResultsClient user={user} initialQuery={q ?? ""} />
}
