import type { Metadata } from "next"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { classifyAuthUser } from "@/lib/judge/sandbox"
import JudgeEntryClient from "./judge-entry-client"

export const metadata: Metadata = {
  title: "Try ShrineKeep",
  robots: { index: false, follow: false },
}

export default async function JudgePage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const classified = await classifyAuthUser(supabase, user)
  const kind =
    classified === "missing" ? "anon" : classified

  return (
    <JudgeEntryClient kind={kind} expiredNotice={params.expired === "1"} />
  )
}
