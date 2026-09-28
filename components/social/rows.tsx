"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { RelationshipMenu } from "@/components/social/relationship-menu"
import { NicknameMark } from "@/components/social/nickname-mark"
import type { FriendEntry, RequestEntry, SocialNotification } from "@/lib/social/contracts"

export function FriendRow({
  entry,
  disabled,
  onUnfriend,
  onBlock,
}: {
  entry: FriendEntry
  disabled: boolean
  onUnfriend: () => void
  onBlock: () => void
}) {
  const href = `/users/${entry.profile.id}`
  return (
    <li className="px-3 py-2">
      <RelationshipMenu
        profileHref={href}
        label={entry.profile.nickname}
        disabled={disabled}
        actions={[
          { id: "unfriend", label: "Unfriend", onSelect: onUnfriend },
          { id: "block", label: "Block", onSelect: onBlock, destructive: true },
        ]}
      >
        <NicknameMark nickname={entry.profile.nickname} />
        <Link href={href} className="min-w-0 flex-1 truncate-line text-fluid-sm text-foreground hover:underline">
          {entry.profile.nickname}
        </Link>
      </RelationshipMenu>
    </li>
  )
}

export function RequestRow({
  entry,
  disabled,
  onAccept,
  onDecline,
  onCancel,
  onBlock,
}: {
  entry: RequestEntry
  disabled: boolean
  onAccept?: () => void
  onDecline?: () => void
  onCancel?: () => void
  onBlock: () => void
}) {
  const href = `/users/${entry.profile.id}`
  const actions = [
    ...(onAccept ? [{ id: "accept", label: "Accept", onSelect: onAccept, disabled }] : []),
    ...(onDecline ? [{ id: "decline", label: "Decline", onSelect: onDecline, disabled }] : []),
    ...(onCancel ? [{ id: "cancel", label: "Cancel request", onSelect: onCancel, disabled }] : []),
    { id: "block", label: "Block", onSelect: onBlock, destructive: true, disabled },
  ]
  return (
    <li className="px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <RelationshipMenu profileHref={href} label={entry.profile.nickname} disabled={disabled} actions={actions}>
            <NicknameMark nickname={entry.profile.nickname} />
            <Link href={href} className="min-w-0 flex-1 truncate-line text-fluid-sm text-foreground hover:underline">
              {entry.profile.nickname}
            </Link>
          </RelationshipMenu>
        </div>
        {onAccept ? (
          <Button type="button" size="sm" disabled={disabled} onClick={onAccept}>
            Accept
          </Button>
        ) : null}
        {onDecline ? (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onDecline}>
            Decline
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </li>
  )
}

export function NotificationRow({
  entry,
  disabled,
  onAccept,
  onDecline,
}: {
  entry: SocialNotification
  disabled: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const href = `/users/${entry.actor.id}`
  const actionable = entry.actionableRequest
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <NicknameMark nickname={entry.actor.nickname} />
      <div className="min-w-0 flex-1">
        <Link href={href} className="text-fluid-sm text-foreground hover:underline">
          {entry.actor.nickname}
        </Link>
        <p className="text-fluid-xs text-muted-foreground">
          {entry.kind === "request" ? "sent a friend request" : "accepted your request"}
          {entry.readAt ? "" : " · unread"}
        </p>
      </div>
      {actionable ? (
        <>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            data-request-id={actionable.requestId}
            data-request-version={actionable.version}
            onClick={onAccept}
          >
            Accept
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onDecline}>
            Decline
          </Button>
        </>
      ) : null}
    </li>
  )
}

export function BlockedRow({
  userId,
  disabled,
  onUnblock,
}: {
  userId: string
  disabled: boolean
  onUnblock: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="truncate-line text-fluid-sm text-foreground">{userId}</span>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onUnblock}>
        Unblock
      </Button>
    </li>
  )
}
