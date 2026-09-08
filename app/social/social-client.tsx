"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ListState, PageControls, socialErrorMessage } from "@/components/social/list-state"
import { BlockedRow, FriendRow, NotificationRow, RequestRow } from "@/components/social/rows"
import { SOCIAL_DEFAULTS, type SocialMutationResult } from "@/lib/social/contracts"
import {
  acceptRequest,
  blockUser,
  cancelRequest,
  declineRequest,
  fetchBlocks,
  fetchFriends,
  fetchNotifications,
  fetchRequests,
  friendsSearchQuery,
  markNotificationsRead,
  parseProfileTarget,
  sendFriendRequest,
  SocialRequestError,
  unblockUser,
  unfriendUser,
} from "@/lib/social/client"
import { applySocialMutation, dropUnblockedUser } from "@/lib/social/invalidate"
import {
  socialActorKey,
  socialBlocksKey,
  socialFriendsKey,
  socialNotificationsKey,
  socialRequestsKey,
} from "@/lib/social/query-keys"

interface SocialClientProps {
  actorId: string
  sandbox: boolean
}

type ConfirmKind = "unfriend" | "block" | "unblock"

interface ConfirmState {
  kind: ConfirmKind
  userId: string
  label: string
}

function useCursorStack(resetKey: string) {
  const [pages, setPages] = useState<Record<string, { cursor: string | null; stack: Array<string | null> }>>({})
  const page = pages[resetKey] ?? { cursor: null, stack: [] }
  return {
    cursor: page.cursor,
    canBack: page.stack.length > 0,
    next(nextCursor: string | null) {
      if (!nextCursor) return
      setPages((current) => {
        const existing = current[resetKey] ?? { cursor: null, stack: [] }
        return {
          ...current,
          [resetKey]: { cursor: nextCursor, stack: [...existing.stack, existing.cursor] },
        }
      })
    },
    back() {
      setPages((current) => {
        const existing = current[resetKey] ?? { cursor: null, stack: [] }
        if (existing.stack.length === 0) return current
        return {
          ...current,
          [resetKey]: { cursor: existing.stack[existing.stack.length - 1], stack: existing.stack.slice(0, -1) },
        }
      })
    },
  }
}

export default function SocialClient({ actorId, sandbox }: SocialClientProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [addInput, setAddInput] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [busy, setBusy] = useState(false)
  const idempotencyKeys = useRef(new Map<string, string>())

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(friendsSearchQuery(searchInput)),
      SOCIAL_DEFAULTS.searchDebounceMs
    )
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const friendsQuery = friendsSearchQuery(debouncedSearch)
  const lookupId = parseProfileTarget(searchInput) ?? parseProfileTarget(addInput)
  const friendsPage = useCursorStack(friendsQuery)
  const incomingPage = useCursorStack("incoming")
  const outgoingPage = useCursorStack("outgoing")
  const notificationPage = useCursorStack("notifications")
  const blocksPage = useCursorStack("blocks")

  const listQuery = {
    refetchOnWindowFocus: true,
    refetchInterval: SOCIAL_DEFAULTS.pollIntervalMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
  } as const

  const actorKey = socialActorKey(actorId)
  const friends = useQuery({
    queryKey: socialFriendsKey(actorId, friendsQuery, friendsPage.cursor),
    queryFn: () => fetchFriends({ query: friendsQuery, cursor: friendsPage.cursor }),
    ...listQuery,
  })
  const incoming = useQuery({
    queryKey: socialRequestsKey(actorId, "incoming", incomingPage.cursor),
    queryFn: () => fetchRequests({ direction: "incoming", cursor: incomingPage.cursor }),
    ...listQuery,
  })
  const outgoing = useQuery({
    queryKey: socialRequestsKey(actorId, "outgoing", outgoingPage.cursor),
    queryFn: () => fetchRequests({ direction: "outgoing", cursor: outgoingPage.cursor }),
    ...listQuery,
  })
  const notifications = useQuery({
    queryKey: socialNotificationsKey(actorId, notificationPage.cursor),
    queryFn: () => fetchNotifications(notificationPage.cursor),
    ...listQuery,
  })
  const blocks = useQuery({
    queryKey: socialBlocksKey(actorId, blocksPage.cursor),
    queryFn: () => fetchBlocks(blocksPage.cursor),
    ...listQuery,
  })

  async function runMutation(action: () => Promise<SocialMutationResult>, targetUserId?: string) {
    setActionError(null)
    setBusy(true)
    try {
      const result = await action()
      applySocialMutation(queryClient, result, { actorId, targetUserId })
      if (
        result.invalidated.includes("blocks") &&
        result.invalidated.includes("friends") &&
        targetUserId &&
        pathname.startsWith(`/users/${targetUserId}`)
      ) {
        router.replace("/social")
      }
      await queryClient.refetchQueries({ queryKey: actorKey })
    } catch (error) {
      setActionError(socialErrorMessage(error))
      if (error instanceof SocialRequestError && error.error.code === "stale_request") {
        await queryClient.refetchQueries({ queryKey: actorKey })
      }
    } finally {
      setBusy(false)
    }
  }

  const sendMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      let key = idempotencyKeys.current.get(targetUserId)
      if (!key) {
        key = crypto.randomUUID()
        idempotencyKeys.current.set(targetUserId, key)
      }
      return sendFriendRequest(targetUserId, key)
    },
    onSuccess: async (result, targetUserId) => {
      applySocialMutation(queryClient, result, { actorId, targetUserId })
      await queryClient.refetchQueries({ queryKey: actorKey })
      setAddError(null)
      setAddInput("")
    },
    onError: (error) => setAddError(socialErrorMessage(error)),
  })

  async function executeConfirm() {
    if (!confirm) return
    const { kind, userId } = confirm
    setConfirm(null)
    if (kind === "unfriend") await runMutation(() => unfriendUser(userId), userId)
    else if (kind === "block") await runMutation(() => blockUser(userId), userId)
    else {
      await runMutation(async () => {
        const result = await unblockUser(userId)
        dropUnblockedUser(queryClient, actorId, userId)
        return result
      }, userId)
    }
  }

  const friendRows = friends.data?.entries ?? []
  const incomingRows = incoming.data?.entries ?? []
  const outgoingRows = outgoing.data?.entries ?? []
  const notificationRows = notifications.data?.entries ?? []
  const blockRows = blocks.data?.entries ?? []
  const unread = notifications.data?.unreadCount ?? 0
  const mutationsLocked = sandbox || busy

  return (
    <div className="container mx-auto min-w-[360px] space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-fluid-2xl font-heading font-semibold text-foreground">Social</h1>
          <p className="text-fluid-sm text-muted-foreground">Friends, requests, and blocked accounts.</p>
        </div>
        {unread > 0 ? (
          <p className="text-fluid-sm text-foreground">
            {unread} unread{notifications.data?.unreadCountCapped ? "+" : ""}
          </p>
        ) : null}
      </div>

      {sandbox ? (
        <p className="rounded-md border border-border bg-light-muted px-3 py-2 text-fluid-sm text-muted-foreground">
          Temporary accounts cannot send requests, accept friends, or block people.
        </p>
      ) : null}
      {actionError ? <p className="text-fluid-sm text-destructive">{actionError}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-fluid-lg">Add by profile link</CardTitle>
          <CardDescription>Paste a user ID or a profile URL. There is no directory to browse.</CardDescription>
          <Link href={`/users/${actorId}`} className="text-fluid-sm text-primary hover:underline w-fit">
            Your public profile
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="social-add" className="sr-only">
              Profile link or user ID
            </Label>
            <Input
              id="social-add"
              value={addInput}
              onChange={(event) => setAddInput(event.target.value)}
              placeholder="User ID or /users/…"
              disabled={sandbox || sendMutation.isPending}
            />
            <Button
              type="button"
              disabled={sandbox || sendMutation.isPending || !parseProfileTarget(addInput)}
              onClick={() => {
                const targetUserId = parseProfileTarget(addInput)
                if (!targetUserId) {
                  setAddError("Enter a user ID or profile link.")
                  return
                }
                sendMutation.mutate(targetUserId)
              }}
            >
              Send request
            </Button>
          </div>
          {addError ? <p className="text-fluid-sm text-destructive">{addError}</p> : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList className="h-auto min-h-10 w-full justify-start gap-1">
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="incoming">Incoming{incomingRows.length ? ` (${incomingRows.length})` : ""}</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          <TabsTrigger value="inbox">
            Inbox{unread ? ` (${unread}${notifications.data?.unreadCountCapped ? "+" : ""})` : ""}
          </TabsTrigger>
          <TabsTrigger value="blocked">Blocked</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="space-y-3">
          <Label htmlFor="social-search" className="sr-only">
            Search friends
          </Label>
          <Input
            id="social-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search friends by nickname"
          />
          {lookupId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-card-foreground">
              <p className="text-fluid-sm text-foreground">
                Profile <span className="font-medium">{lookupId}</span>
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={`/users/${lookupId}`}>Open</Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={sandbox || sendMutation.isPending}
                  onClick={() => sendMutation.mutate(lookupId)}
                >
                  Send request
                </Button>
              </div>
            </div>
          ) : null}
          <ListState
            loading={friends.isLoading}
            error={friends.error}
            empty={!friendRows.length}
            emptyText={friendsQuery ? "No friends match that search." : "No friends yet."}
            onRetry={() => void friends.refetch()}
          >
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {friendRows.map((entry) => (
                <FriendRow
                  key={entry.profile.id}
                  entry={entry}
                  disabled={mutationsLocked}
                  onUnfriend={() => setConfirm({ kind: "unfriend", userId: entry.profile.id, label: entry.profile.nickname })}
                  onBlock={() => setConfirm({ kind: "block", userId: entry.profile.id, label: entry.profile.nickname })}
                />
              ))}
            </ul>
          </ListState>
          <PageControls
            hasMore={friends.data?.hasMore === true}
            canBack={friendsPage.canBack}
            onBack={() => friendsPage.back()}
            onNext={() => friendsPage.next(friends.data?.nextCursor ?? null)}
            disabled={friends.isFetching}
          />
        </TabsContent>

        <TabsContent value="incoming" className="space-y-3">
          <ListState
            loading={incoming.isLoading}
            error={incoming.error}
            empty={!incomingRows.length}
            emptyText="No incoming requests."
            onRetry={() => void incoming.refetch()}
          >
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {incomingRows.map((entry) => (
                <RequestRow
                  key={entry.requestId}
                  entry={entry}
                  disabled={mutationsLocked}
                  onAccept={() =>
                    void runMutation(
                      () => acceptRequest({ targetUserId: entry.profile.id, requestId: entry.requestId, version: entry.version }),
                      entry.profile.id
                    )
                  }
                  onDecline={() =>
                    void runMutation(
                      () => declineRequest({ targetUserId: entry.profile.id, requestId: entry.requestId, version: entry.version }),
                      entry.profile.id
                    )
                  }
                  onBlock={() => setConfirm({ kind: "block", userId: entry.profile.id, label: entry.profile.nickname })}
                />
              ))}
            </ul>
          </ListState>
          <PageControls
            hasMore={incoming.data?.hasMore === true}
            canBack={incomingPage.canBack}
            onBack={() => incomingPage.back()}
            onNext={() => incomingPage.next(incoming.data?.nextCursor ?? null)}
            disabled={incoming.isFetching}
          />
        </TabsContent>

        <TabsContent value="outgoing" className="space-y-3">
          <ListState
            loading={outgoing.isLoading}
            error={outgoing.error}
            empty={!outgoingRows.length}
            emptyText="No outgoing requests."
            onRetry={() => void outgoing.refetch()}
          >
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {outgoingRows.map((entry) => (
                <RequestRow
                  key={entry.requestId}
                  entry={entry}
                  disabled={mutationsLocked}
                  onCancel={() =>
                    void runMutation(
                      () => cancelRequest({ targetUserId: entry.profile.id, requestId: entry.requestId, version: entry.version }),
                      entry.profile.id
                    )
                  }
                  onBlock={() => setConfirm({ kind: "block", userId: entry.profile.id, label: entry.profile.nickname })}
                />
              ))}
            </ul>
          </ListState>
          <PageControls
            hasMore={outgoing.data?.hasMore === true}
            canBack={outgoingPage.canBack}
            onBack={() => outgoingPage.back()}
            onNext={() => outgoingPage.next(outgoing.data?.nextCursor ?? null)}
            disabled={outgoing.isFetching}
          />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sandbox || busy || unread === 0}
              onClick={() => void runMutation(() => markNotificationsRead({ allVisible: true }))}
            >
              Mark visible read
            </Button>
          </div>
          <ListState
            loading={notifications.isLoading}
            error={notifications.error}
            empty={!notificationRows.length}
            emptyText="No notifications."
            onRetry={() => void notifications.refetch()}
          >
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {notificationRows.map((entry) => (
                <NotificationRow
                  key={entry.id}
                  entry={entry}
                  disabled={mutationsLocked}
                  onAccept={() => {
                    const action = entry.actionableRequest
                    if (!action) return
                    void runMutation(
                      () => acceptRequest({ targetUserId: entry.actor.id, requestId: action.requestId, version: action.version }),
                      entry.actor.id
                    )
                  }}
                  onDecline={() => {
                    const action = entry.actionableRequest
                    if (!action) return
                    void runMutation(
                      () => declineRequest({ targetUserId: entry.actor.id, requestId: action.requestId, version: action.version }),
                      entry.actor.id
                    )
                  }}
                />
              ))}
            </ul>
          </ListState>
          <PageControls
            hasMore={notifications.data?.hasMore === true}
            canBack={notificationPage.canBack}
            onBack={() => notificationPage.back()}
            onNext={() => notificationPage.next(notifications.data?.nextCursor ?? null)}
            disabled={notifications.isFetching}
          />
        </TabsContent>

        <TabsContent value="blocked" className="space-y-3">
          <p className="text-fluid-sm text-muted-foreground">Blocked accounts are listed by user ID only.</p>
          <ListState
            loading={blocks.isLoading}
            error={blocks.error}
            empty={!blockRows.length}
            emptyText="No blocked accounts."
            onRetry={() => void blocks.refetch()}
          >
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {blockRows.map((entry) => (
                <BlockedRow
                  key={entry.userId}
                  userId={entry.userId}
                  disabled={mutationsLocked}
                  onUnblock={() => setConfirm({ kind: "unblock", userId: entry.userId, label: entry.userId })}
                />
              ))}
            </ul>
          </ListState>
          <PageControls
            hasMore={blocks.data?.hasMore === true}
            canBack={blocksPage.canBack}
            onBack={() => blocksPage.back()}
            onNext={() => blocksPage.next(blocks.data?.nextCursor ?? null)}
            disabled={blocks.isFetching}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "unfriend" ? "Unfriend" : confirm?.kind === "block" ? "Block" : "Unblock"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "unfriend"
                ? `Remove ${confirm.label} from your friends? They will lose Friends-only access.`
                : confirm?.kind === "block"
                  ? `Block ${confirm.label}? This removes any friendship or pending request. Guests can still see public content.`
                  : `Unblock ${confirm?.label}? Friendship is not restored.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm?.kind === "unblock" ? "default" : "destructive"}
              onClick={() => void executeConfirm()}
            >
              {confirm?.kind === "unfriend" ? "Unfriend" : confirm?.kind === "block" ? "Block" : "Unblock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
