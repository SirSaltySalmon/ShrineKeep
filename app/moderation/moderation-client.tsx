"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type LookupUser = {
  id: string
  email: string | null
  email_confirmed_at: string | null
  created_at: string
  last_sign_in_at: string | null
  username: string | null
  display_name: string | null
  profile_created_at: string | null
  has_pro_subscription_record: boolean
  subscription_status: string | null
}

const fetchOpts: RequestInit = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
}

export function ModerationClient() {
  const [userId, setUserId] = useState("")
  const [user, setUser] = useState<LookupUser | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [banLoading, setBanLoading] = useState(false)
  const [banMessage, setBanMessage] = useState<string | null>(null)
  const [banError, setBanError] = useState<string | null>(null)
  const [clientOrigin, setClientOrigin] = useState<string | null>(null)

  useEffect(() => {
    setClientOrigin(window.location.origin)
  }, [])

  const runLookup = async () => {
    setLookupError(null)
    setBanMessage(null)
    setBanError(null)
    setUser(null)
    setVerified(false)

    const trimmed = userId.trim()
    if (!trimmed) {
      setLookupError("Enter a user UUID.")
      return
    }

    setLookupLoading(true)
    try {
      const res = await fetch("/api/moderation/lookup-user", {
        ...fetchOpts,
        method: "POST",
        body: JSON.stringify({ user_id: trimmed }),
      })
      const data = (await res.json()) as { error?: string; user?: LookupUser }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setLookupError(data.error ?? "Session expired or not a moderator. Refresh and sign in again.")
        } else {
          setLookupError(data.error ?? `Request failed (${res.status})`)
        }
        return
      }
      if (!data.user) {
        setLookupError("Unexpected response.")
        return
      }
      setUser(data.user)
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Network error."
          : e instanceof Error
            ? e.message
            : "Lookup failed."
      setLookupError(msg)
    } finally {
      setLookupLoading(false)
    }
  }

  const runBan = async () => {
    if (!user) return
    setBanError(null)
    setBanMessage(null)

    if (!verified) {
      setBanError("Confirm that you have verified this is the correct user.")
      return
    }

    setBanLoading(true)
    try {
      const res = await fetch("/api/moderation/ban-user", {
        ...fetchOpts,
        method: "POST",
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = (await res.json()) as {
        error?: string
        ok?: boolean
        deleted_storage?: { item_photos: number; avatars: number }
        include_subscription_cancelled_notice?: boolean
        partial?: unknown
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setBanError(data.error ?? "Session expired or not a moderator. Refresh and sign in again.")
        } else {
          setBanError(data.error ?? `Ban failed (${res.status})`)
        }
        return
      }

      setBanMessage(
        `User banned. Storage removed: ${data.deleted_storage?.item_photos ?? 0} item photo(s), ${data.deleted_storage?.avatars ?? 0} avatar file(s).` +
          (data.include_subscription_cancelled_notice
            ? " Pro subscription was cancelled (if applicable)."
            : "")
      )
      setUser(null)
      setUserId("")
      setVerified(false)
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Network error."
          : e instanceof Error
            ? e.message
            : "Ban failed."
      setBanError(msg)
    } finally {
      setBanLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Signed in as a moderator on{" "}
          <span className="text-foreground font-mono text-xs">
            {clientOrigin ?? "—"}
          </span>
          . Look up a user by Supabase Auth user id (UUID), verify their details, then ban. Requests
          use your session cookie; the server checks your email against{" "}
          <code className="text-foreground rounded bg-muted px-1 py-0.5 text-xs">MODERATOR_EMAILS</code>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Look up user</CardTitle>
          <CardDescription>
            Paste the Auth user UUID (from Supabase dashboard → Authentication → Users).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-id">User id (UUID)</Label>
            <Input
              id="user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              className="font-mono text-sm"
            />
          </div>
          {lookupError && (
            <p className="text-destructive text-sm" role="alert">
              {lookupError}
            </p>
          )}
          <Button type="button" onClick={runLookup} disabled={lookupLoading}>
            {lookupLoading ? "Loading…" : "Fetch user"}
          </Button>
        </CardContent>
      </Card>

      {user && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle>Verify before ban</CardTitle>
            <CardDescription>
              Confirm this account matches the violation. Banning is permanent and runs the full
              moderation pipeline (Stripe, email, storage, Auth delete).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">User id</dt>
              <dd className="font-mono text-xs break-all">{user.id}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{user.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Username</dt>
              <dd>{user.username ?? "—"}</dd>
              <dt className="text-muted-foreground">Display name</dt>
              <dd>{user.display_name ?? "—"}</dd>
              <dt className="text-muted-foreground">Pro record</dt>
              <dd>
                {user.has_pro_subscription_record
                  ? `Yes (${user.subscription_status ?? "unknown status"})`
                  : "No"}
              </dd>
              <dt className="text-muted-foreground">Signed up</dt>
              <dd>{new Date(user.created_at).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString()
                  : "—"}
              </dd>
            </dl>
            <label className="flex cursor-pointer items-start gap-2 pt-2">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="border-input mt-1 h-4 w-4 rounded"
              />
              <span>
                I confirm this is the correct user and I intend to ban them and wipe their data.
              </span>
            </label>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3">
            {banError && (
              <p className="text-destructive text-sm" role="alert">
                {banError}
              </p>
            )}
            {banMessage && (
              <p className="text-sm text-green-700 dark:text-green-400" role="status">
                {banMessage}
              </p>
            )}
            <Button
              type="button"
              variant="destructive"
              disabled={banLoading || !verified}
              onClick={runBan}
              className={cn(!verified && "opacity-60")}
            >
              {banLoading ? "Banning…" : "Ban user permanently"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
