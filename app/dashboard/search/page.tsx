import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import SearchResultsClient from "./search-results-client"

export default async function DashboardSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    includeTags?: string
    excludeTags?: string
    valueMin?: string
    valueMax?: string
    acquisitionMin?: string
    acquisitionMax?: string
    dateFrom?: string
    dateTo?: string
    tagColors?: string
  }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single()

  const params = await searchParams

  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8 min-w-0">Loading search…</div>}>
      <SearchResultsClient
        user={user}
        initialQuery={params.q ?? ""}
        initialIncludeTags={params.includeTags?.split(",").filter(Boolean) ?? []}
        initialExcludeTags={params.excludeTags?.split(",").filter(Boolean) ?? []}
        initialValueMin={params.valueMin}
        initialValueMax={params.valueMax}
        initialAcquisitionMin={params.acquisitionMin}
        initialAcquisitionMax={params.acquisitionMax}
        initialDateFrom={params.dateFrom}
        initialDateTo={params.dateTo}
        initialTagColors={params.tagColors?.split(",").filter(Boolean) ?? []}
      />
    </Suspense>
  )
}
