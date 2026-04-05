import type { Metadata } from "next"
import { isValidModerationPageKey } from "@/lib/moderation/request-auth"
import { ModerationClient } from "./moderation-client"

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
}

type ModerationPageProps = {
  searchParams: Promise<{ key?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string {
  if (value == null) {
    return ""
  }
  return typeof value === "string" ? value : (value[0] ?? "")
}

export default async function ModerationPage({ searchParams }: ModerationPageProps) {
  const sp = await searchParams
  const key = firstParam(sp.key)

  if (!isValidModerationPageKey(key)) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Unauthorized.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6 md:p-10">
      <ModerationClient initialSecret={key} />
    </div>
  )
}
