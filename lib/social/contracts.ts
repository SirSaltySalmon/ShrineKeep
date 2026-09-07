import type { CursorPage, OperationResult, PublicIdentity } from "@/lib/sharing/contracts"

export type Relationship = "self" | "none" | "outgoing_pending" | "incoming_pending" | "friends"
export const SOCIAL_DEFAULTS = {
  pageSize: 20,
  pollIntervalMs: 30_000,
  searchDebounceMs: 250,
  requestsPerMinute: 10,
  requestsPerDay: 50,
  pairCooldownHours: 24,
  unreadCountCap: 100,
  markReadMaxIds: 100,
  notificationRetentionDays: 90,
} as const

export type SocialInvalidation = "friends" | "requests" | "notifications" | "blocks"
export interface SocialMutationResult {
  revision: string
  invalidated: SocialInvalidation[]
}

export interface FriendEntry {
  profile: PublicIdentity
  acceptedAt: string
}

export interface RequestEntry {
  profile: PublicIdentity
  requestId: string
  version: string
  createdAt: string
  direction: "incoming" | "outgoing"
}

export interface SocialNotification {
  id: string
  actor: PublicIdentity
  kind: "request" | "acceptance"
  createdAt: string
  readAt: string | null
  /** Null for stale/resolved events. Historical text never grants an action. */
  actionableRequest: { requestId: string; version: string } | null
}

export type SocialMutation =
  | { operation: "send_request"; targetId: string; idempotencyKey: string }
  | { operation: "unfriend" | "block" | "unblock"; targetId: string }
  | { operation: "accept" | "decline" | "cancel"; targetId: string; requestId: string; version: string }

/** Actor IDs are trusted server arguments, never accepted from request bodies. */
export interface SocialService {
  friends(actorId: string, request: { query?: string; cursor?: string }): Promise<OperationResult<CursorPage<FriendEntry>>>
  requests(actorId: string, request: { direction: "incoming" | "outgoing"; cursor?: string }): Promise<OperationResult<CursorPage<RequestEntry>>>
  mutate(actorId: string, input: SocialMutation): Promise<OperationResult<SocialMutationResult>>
  notifications(actorId: string, request: { cursor?: string }): Promise<OperationResult<CursorPage<SocialNotification> & { unreadCount: number; unreadCountCapped: boolean }>>
  markRead(actorId: string, request: { notificationIds: string[] } | { allVisible: true }): Promise<OperationResult<SocialMutationResult>>
  /** Block management deliberately returns no denied profile identity. */
  blocks(actorId: string, request: { cursor?: string }): Promise<OperationResult<CursorPage<{ userId: string; createdAt: string }>>>
}
