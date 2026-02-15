"use client"

import { useEffect, useState } from "react"

export function NotFoundCode() {
  const [code, setCode] = useState<string>("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location
      setCode(pathname + search || window.location.href || "(unknown path)")
    }
  }, [])

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
