"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { socialErrorMessage } from "@/components/social/list-state"
import {
  acceptRequest,
  blockUser,
  cancelRequest,
  declineRequest,
  fetchRequests,
  sendFriendRequest,
  unfriendUser,
} from "@/lib/social/client"
import { applySocialMutation } from "@/lib/social/invalidate"
import { socialRequestsKey } from "@/lib/social/query-keys"
import type { Relationship, RequestEntry } from "@/lib/social/contracts"
import type { PublishedViewer } from "@/lib/sharing/contracts"

interface RelationshipControlsProps {
  ownerId: string
  label: string
  relationship: Relationship
  viewer: PublishedViewer
  sandbox: boolean
  socialMutationsEnabled: boolean
}

type ConfirmKind = "unfriend" | "block"

async function findPendingRequest(ownerId: string, direction: "incoming" | "outgoing"): Promise<RequestEntry | null> {
  let cursor: string | null = null
  for (let pages = 0; pages < 8; pages += 1) {
    const page = await fetchRequests({ direction, cursor })
    const match = page.entries.find((entry) => entry.profile.id === ownerId)
    if (match) return match
    if (!page.hasMore || !page.nextCursor) return null
    cursor = page.nextCursor
  }
  return null
}

export function RelationshipControls({
  ownerId,
  label,
  relationship,
  viewer,
  sandbox,
  socialMutationsEnabled,
}: RelationshipControlsProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const idempotencyKey = useRef<string | null>(null)
  const actorId = viewer.kind === "authenticated" ? viewer.userId : null
  const mutationsLocked = sandbox || busy || !socialMutationsEnabled || !actorId
  const pendingDirection = relationship === "incoming_pending" ? "incoming" : relationship === "outgoing_pending" ? "outgoing" : null

  const pending = useQuery({
    queryKey: actorId && pendingDirection ? socialRequestsKey(actorId, pendingDirection, null) : ["public-relationship", ownerId, "idle"],
    queryFn: () => findPendingRequest(ownerId, pendingDirection!),
    enabled: Boolean(actorId && pendingDirection && socialMutationsEnabled),
  })

  async function run(action: () => Promise<{ revision: string; invalidated: Array<"friends" | "requests" | "notifications" | "blocks"> }>) {
    if (!actorId) return
    setError(null)
    setBusy(true)
    try {
      const result = await action()
      applySocialMutation(queryClient, result, { actorId, targetUserId: ownerId })
      if (result.invalidated.includes("blocks") && result.invalidated.includes("friends") && pathname.startsWith(`/users/${ownerId}`)) {
        router.replace("/social")
      }
      router.refresh()
    } catch (caught) {
      setError(socialErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID()
      return sendFriendRequest(ownerId, idempotencyKey.current)
    },
    onSuccess: async (result) => {
      if (!actorId) return
      applySocialMutation(queryClient, result, { actorId, targetUserId: ownerId })
      router.refresh()
    },
    onError: (caught) => setError(socialErrorMessage(caught)),
  })

  if (relationship === "self") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/settings">Settings</Link>
      </Button>
    )
  }

  if (!actorId) {
    return (
      <Button asChild size="sm">
        <Link href={`/auth/login?next=${encodeURIComponent(`/users/${ownerId}`)}`}>Sign in</Link>
      </Button>
    )
  }

  if (!socialMutationsEnabled) return null

  const request = pending.data
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {relationship === "none" ? (
        <Button type="button" size="sm" disabled={mutationsLocked || sendMutation.isPending} onClick={() => sendMutation.mutate()}>
          Add friend
        </Button>
      ) : null}
      {relationship === "incoming_pending" ? (
        <>
          <Button
            type="button"
            size="sm"
            disabled={mutationsLocked || !request}
            data-request-id={request?.requestId}
            data-request-version={request?.version}
            onClick={() => request && void run(() => acceptRequest({ targetUserId: ownerId, requestId: request.requestId, version: request.version }))}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mutationsLocked || !request}
            onClick={() => request && void run(() => declineRequest({ targetUserId: ownerId, requestId: request.requestId, version: request.version }))}
          >
            Decline
          </Button>
        </>
      ) : null}
      {relationship === "outgoing_pending" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={mutationsLocked || !request}
          onClick={() => request && void run(() => cancelRequest({ targetUserId: ownerId, requestId: request.requestId, version: request.version }))}
        >
          Cancel request
        </Button>
      ) : null}
      {relationship === "friends" ? (
        <Button type="button" size="sm" variant="outline" disabled={mutationsLocked} onClick={() => setConfirm("unfriend")}>
          Unfriend
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" disabled={mutationsLocked} onClick={() => setConfirm("block")}>
        Block
      </Button>
    </div>
  )

  return (
    <div className="space-y-2">
      {actions}
      {error ? <p className="text-fluid-sm text-destructive">{error}</p> : null}
      <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "unfriend" ? "Unfriend" : "Block"}</DialogTitle>
            <DialogDescription>
              {confirm === "unfriend"
                ? `Remove ${label} from your friends? They will lose Friends-only access.`
                : `Block ${label}? This removes any friendship or pending request. Guests can still see public content.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const kind = confirm
                setConfirm(null)
                if (kind === "unfriend") void run(() => unfriendUser(ownerId))
                else if (kind === "block") void run(() => blockUser(ownerId))
              }}
            >
              {confirm === "unfriend" ? "Unfriend" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
