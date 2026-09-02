import type { WebMcpToolStatus } from "@/lib/hooks/use-webmcp-tool"

export type FirstRunSurface = "none" | "wait" | "coach"

export const FIRST_RUN_CHECK_TIMEOUT_MS = 2000

export function coachToolsSettled(
  statuses: readonly WebMcpToolStatus[]
): "ready" | "unsupported" | "error" | "checking" {
  if (statuses.every((status) => status === "ready")) return "ready"
  if (statuses.some((status) => status === "error")) return "error"
  if (statuses.every((status) => status === "disabled" || status === "unsupported")) {
    return "unsupported"
  }
  if (statuses.some((status) => status === "unsupported") && !statuses.some((status) => status === "checking" || status === "registering")) {
    return "unsupported"
  }
  return "checking"
}

export function chooseFirstRun(input: {
  dismissed: boolean
  coachTools: readonly WebMcpToolStatus[]
  elapsedMs: number
}): FirstRunSurface {
  if (input.dismissed) return "none"
  const settled = coachToolsSettled(input.coachTools)
  if (settled === "checking" && input.elapsedMs < FIRST_RUN_CHECK_TIMEOUT_MS) {
    return "wait"
  }
  return "coach"
}
