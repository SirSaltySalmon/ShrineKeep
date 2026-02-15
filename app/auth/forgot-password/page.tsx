"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import TurnstileWidget from "@/components/turnstile-widget"
import type { AuthEmailResponse } from "@/lib/auth-utils"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuthEmailResponse | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    if (!captchaToken) {
      setResult({ ok: false, code: "failed", message: "Please complete the captcha verification." })
      setLoading(false)
      return
    }
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      })
      const data: AuthEmailResponse = await res.json()
      setResult(data)
    } catch {
      setResult({ ok: false, code: "failed", message: "Could not send reset email. Try again." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md min-w-0 overflow-hidden">
        <CardHeader className="space-y-1 min-w-0">
          <CardTitle className="text-fluid-2xl font-bold text-center min-w-0">
            Forgot password
          </CardTitle>
          <CardDescription className="text-center min-w-0">
            Enter your email and we&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0 overflow-visible">
          <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2 min-w-0">
              <TurnstileWidget onSuccess={setCaptchaToken} />
            </div>
            {result && !result.ok && (
              <p
                className={`text-fluid-sm min-w-0 break-words ${
                  result.code === "rate_limited"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive"
                }`}
              >
                {result.message}
              </p>
            )}
            {result?.ok && (
              <p className="text-fluid-sm text-green-600 dark:text-green-400 min-w-0">
                Check your email for a reset link. You can close this page.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading || !captchaToken}>
              {loading ? "Sending…" : "Send reset link"}
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
