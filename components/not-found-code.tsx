"use client"

import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => undefined

function getNotFoundPath() {
  return window.location.pathname + window.location.search || window.location.href || "(unknown path)"
}

export function NotFoundCode() {
  const code = useSyncExternalStore(emptySubscribe, getNotFoundPath, () => "")

  if (!code) {
    return (
      <code className="block break-all text-sm font-mono text-foreground bg-background/80 px-3 py-2 rounded border border-border animate-pulse">
        …
      </code>
    )
  }

  return (
    <code className="block break-all text-sm font-mono text-foreground bg-background/80 px-3 py-2 rounded border border-border">
      {code}
    </code>
  )
}
