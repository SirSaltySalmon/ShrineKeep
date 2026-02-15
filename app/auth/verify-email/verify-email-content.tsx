"use client"

import { useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { AuthEmailResponse } from "@/lib/auth-utils"

export default function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const emailFromUrl = useMemo(
    () => (typeof window !== "undefined" ? searchParams.get("email") : null),
    [searchParams]
  )
  const [resendLoading, setResendLoading] = useState(false)
  const [resendResult, setResendResult] = useState<AuthEmailResponse | null>(null)

  const handleResend = async () => {
    setResendLoading(true)
    setResendResult(null)
    try {
      const res = await fetch("/auth/resend-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailFromUrl ? { email: emailFromUrl } : {}),
      })
      const data: AuthEmailResponse = await res.json()
      setResendResult(data)
    } catch {
      setResendResult({ ok: false, code: "failed", message: "Could not resend. Try again." })
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md min-w-0 overflow-hidden">
        <CardHeader className="space-y-1 min-w-0">
          <CardTitle className="text-fluid-2xl font-bold text-center min-w-0">Verify Your Email</CardTitle>
          <CardDescription className="text-center min-w-0">
            Please check your email for a verification link, then click below to log in again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 layout-shrink-visible text-center">
          <Button asChild className="w-full">
            <Link href="/auth/login">Sign In</Link>
          </Button>
          <div className="space-y-2">
            <p className="text-fluid-sm text-muted-foreground min-w-0">
              Didn&apos;t receive the email?
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resendLoading}
            >
              {resendLoading ? "Sending…" : "Resend verification email"}
            </Button>
            {resendResult && !resendResult.ok && (
              <p
                className={`text-fluid-sm min-w-0 break-words ${
                  resendResult.code === "rate_limited"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive"
                }`}
              >
                {resendResult.message}
              </p>
            )}
            {resendResult?.ok && (
              <p className="text-fluid-sm text-green-600 dark:text-green-400 min-w-0">
                Verification email sent. Check your inbox.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
