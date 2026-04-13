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
  const [lookupInput, setLookupInput] = useState("")
  const [user, setUser] = useState<LookupUser | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [actionLoading, setActionLoading] = useState<null | "ban" | "cancel" | "storage">(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [clientOrigin, setClientOrigin] = useState<string | null>(null)

  useEffect(() => {
    setClientOrigin(window.location.origin)
  }, [])

  const runLookup = async () => {
    setLookupError(null)
    setActionMessage(null)
    setActionError(null)
    setUser(null)
    setVerified(false)

    const trimmed = lookupInput.trim()
    if (!trimmed) {
      setLookupError("Enter a user UUID or email.")
      return
    }

    setLookupLoading(true)
    try {
      const res = await fetch("/api/moderation/lookup-user", {
        ...fetchOpts,
        method: "POST",
        body: JSON.stringify({ lookup: trimmed }),
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

  const runAction = async (action: "ban" | "cancel" | "storage") => {
    if (!user) return
    setActionError(null)
    setActionMessage(null)

    if (!verified) {
      setActionError("Confirm that you have verified this is the correct user.")
      return
    }

    const endpoint =
      action === "ban"
        ? "/api/moderation/ban-user"
        : action === "cancel"
          ? "/api/moderation/cancel-subscription"
          : "/api/moderation/delete-storage"

    setActionLoading(action)
    try {
      const res = await fetch(endpoint, {
        ...fetchOpts,
        method: "POST",
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = (await res.json()) as {
        error?: string
        ok?: boolean
        deleted_storage?: { item_photos: number; avatars: number }
        include_subscription_cancelled_notice?: boolean
        subscription_cancelled?: boolean
        partial?: unknown
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setActionError(data.error ?? "Session expired or not a moderator. Refresh and sign in again.")
        } else {
          const label = action === "ban" ? "Ban" : action === "cancel" ? "Cancellation" : "Storage wipe"
          setActionError(data.error ?? `${label} failed (${res.status})`)
        }
        return
      }

      if (action === "ban") {
        setActionMessage(
          `User banned. Storage removed: ${data.deleted_storage?.item_photos ?? 0} item photo(s), ${data.deleted_storage?.avatars ?? 0} avatar file(s).` +
            (data.include_subscription_cancelled_notice
              ? " Pro subscription was cancelled (if applicable)."
              : "")
        )
        setUser(null)
        setLookupInput("")
        setVerified(false)
        return
      }

      if (action === "cancel") {
        if (!data.include_subscription_cancelled_notice) {
          setActionMessage("No Stripe subscription id found for this user.")
        } else if (data.subscription_cancelled) {
          setActionMessage("Subscription cancelled in Stripe.")
        } else {
          setActionMessage("Subscription exists but was already in a non-cancellable state.")
        }
        return
      }

      setActionMessage(
        `Storage removed: ${data.deleted_storage?.item_photos ?? 0} item photo(s), ${data.deleted_storage?.avatars ?? 0} avatar file(s).`
      )
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === "Failed to fetch"
          ? "Network error."
          : e instanceof Error
            ? e.message
            : "Moderation action failed."
      setActionError(msg)
    } finally {
      setActionLoading(null)
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
          . Look up a user by Supabase Auth user id (UUID) or email, verify their details, then run
          individual actions or full ban. Requests use your session cookie; the server checks your
          email against{" "}
          <code className="text-foreground rounded bg-muted px-1 py-0.5 text-xs">MODERATOR_EMAILS</code>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Look up user</CardTitle>
          <CardDescription>
            Enter Auth user UUID or exact email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lookup">User id (UUID) or email</Label>
            <Input
              id="lookup"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000 or user@example.com"
              className="text-sm"
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
            <CardTitle>Verify before action</CardTitle>
            <CardDescription>
              Confirm this account matches the intended moderation target. Banning is permanent and
              runs the full pipeline (Stripe, email, storage, Auth delete). You can also run
              subscription cancellation and storage wipe independently.
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
                I confirm this is the correct user and I understand these actions are destructive.
              </span>
            </label>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3">
            {actionError && (
              <p className="text-destructive text-sm" role="alert">
                {actionError}
              </p>
            )}
            {actionMessage && (
              <p className="text-sm text-green-700 dark:text-green-400" role="status">
                {actionMessage}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                disabled={actionLoading !== null || !verified}
                onClick={() => runAction("cancel")}
                className={cn(!verified && "opacity-60")}
              >
                {actionLoading === "cancel" ? "Cancelling…" : "Cancel subscription only"}
              </Button>
              <Button
                type="button"
                disabled={actionLoading !== null || !verified}
                onClick={() => runAction("storage")}
                className={cn(!verified && "opacity-60")}
              >
                {actionLoading === "storage" ? "Deleting…" : "Delete storage only"}
              </Button>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={actionLoading !== null || !verified}
              onClick={() => runAction("ban")}
              className={cn(!verified && "opacity-60")}
            >
              {actionLoading === "ban" ? "Banning…" : "Ban user permanently"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
