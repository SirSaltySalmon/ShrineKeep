"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import TurnstileWidget, { type TurnstileWidgetRef } from "@/components/turnstile-widget"
import { SiteLogoMark } from "@/components/site-logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { COACH_STORAGE_KEY } from "@/lib/webmcp/first-run-coach"

type Kind = "anon" | "sandbox" | "user" | "expired"

export default function JudgeEntryClient({
  kind,
  expiredNotice,
}: {
  kind: Kind
  expiredNotice: boolean
}) {
  const router = useRouter()
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)

  const run = async (path: "/api/judge/enter" | "/api/judge/restart") => {
    if (!captchaToken) {
      setError("Please complete the captcha verification.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start sandbox. Try again.")
      }
      if (path === "/api/judge/restart") {
        try {
          sessionStorage.removeItem(COACH_STORAGE_KEY)
        } catch {
          /* ignore */
        }
      }
      router.push("/dashboard")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start sandbox. Try again.")
      setCaptchaToken(null)
      turnstileRef.current?.reset()
      setLoading(false)
    }
  }

  if (kind === "user") {
    return (
      <JudgeShell
        title="You're already signed in"
        description="This judge link creates a throwaway account. Use your dashboard instead."
      >
        <Button asChild className="w-full min-h-11">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </JudgeShell>
    )
  }

  const firstVisit = kind === "anon" || kind === "expired"
  const title = expiredNotice || kind === "expired" ? "That sandbox expired" : "Try ShrineKeep"
  const description = firstVisit
    ? "Creates a throwaway account. Expires in 24 hours. Keep this page. Come back here to continue or start over."
    : "You already have a live sandbox in this browser. Continue where you left off, or wipe it and start empty."

  return (
    <>
      <JudgeShell title={title} description={description}>
        {kind === "expired" || expiredNotice ? (
          <p className="text-fluid-sm text-muted-foreground">Start a new one to keep judging.</p>
        ) : null}
        {kind === "sandbox" ? (
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full min-h-11">
              <Link href="/dashboard">Continue</Link>
            </Button>
            <TurnstileWidget ref={turnstileRef} onSuccess={setCaptchaToken} />
            {error ? <p className="form-error-message">{error}</p> : null}
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-11"
              disabled={loading || !captchaToken}
              onClick={() => setConfirmRestart(true)}
            >
              Start over
            </Button>
          </div>
        ) : (
          <>
            <TurnstileWidget ref={turnstileRef} onSuccess={setCaptchaToken} />
            {error ? <p className="form-error-message">{error}</p> : null}
            <Button
              className="w-full min-h-11"
              disabled={loading || !captchaToken}
              onClick={() => void run("/api/judge/enter")}
            >
              {loading ? "Starting…" : "Enter sandbox"}
            </Button>
          </>
        )}
      </JudgeShell>
      <Dialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this sandbox and start empty?</DialogTitle>
            <DialogDescription>
              The current throwaway account and its collection will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRestart(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => {
                setConfirmRestart(false)
                void run("/api/judge/restart")
              }}
            >
              Start over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function JudgeShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md min-w-0 overflow-hidden">
        <CardHeader className="space-y-1 min-w-0">
          <CardTitle className="flex flex-wrap items-center justify-center gap-2 text-center font-heading text-fluid-2xl font-bold">
            <SiteLogoMark className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
            <span className="min-w-0 leading-tight">{title}</span>
          </CardTitle>
          <CardDescription className="text-center">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  )
}
