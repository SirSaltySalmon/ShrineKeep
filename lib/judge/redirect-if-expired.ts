import { redirect } from "next/navigation"
import { isSandboxExpired, type SandboxRow } from "@/lib/judge/sandbox"

export function redirectIfSandboxRowExpired(row: SandboxRow | null | undefined) {
  if (row && isSandboxExpired(row)) {
    redirect("/api/judge/session/end")
  }
}
