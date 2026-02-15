"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_LENGTH_MESSAGE } from "@/lib/validation"

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createSupabaseClient()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      const isRecoveryRedirect = hash.includes("type=recovery")

      let session = (await supabase.auth.getSession()).data.session
      if (!session?.user && isRecoveryRedirect && hash) {
        const params = new URLSearchParams(hash.replace(/^#/, ""))
        const access_token = params.get("access_token")
        const refresh_token = params.get("refresh_token")
        if (access_token && refresh_token) {
          const { data } = await supabase.auth.setSession({ access_token, refresh_token })
          session = data.session
          if (session && typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname)
          }
        }
      }
      if (!cancelled) {
        setHasRecoverySession(!!session?.user)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [supabase.auth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setError(PASSWORD_LENGTH_MESSAGE)
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (hasRecoverySession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md min-w-0 overflow-hidden">
          <CardContent className="pt-6">
            <p className="text-fluid-sm text-muted-foreground text-center">Loading…</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hasRecoverySession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md min-w-0 overflow-hidden">
          <CardHeader className="space-y-1 min-w-0">
            <CardTitle className="text-fluid-2xl font-bold text-center min-w-0">
              Invalid or expired link
            </CardTitle>
            <CardDescription className="text-center min-w-0">
              Request a new password reset link from the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <Button asChild className="w-full">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md min-w-0 overflow-hidden">
        <CardHeader className="space-y-1 min-w-0">
          <CardTitle className="text-fluid-2xl font-bold text-center min-w-0">
            Set new password
          </CardTitle>
          <CardDescription className="text-center min-w-0">
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0 overflow-visible">
          <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2 min-w-0">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-fluid-sm text-destructive min-w-0 break-words">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
          <div className="text-center">
            <Link
              href="/auth/login"
              className="text-fluid-sm text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
