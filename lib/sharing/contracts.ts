import type { FontFamilyId } from "@/lib/fonts"
import type { Theme } from "@/lib/types"
import type { Relationship } from "@/lib/social/contracts"

/** v1 is additive. These DTOs must never be cast to owner database types. */
export const SHARING_CONTRACT_VERSION = 1 as const
export const AUDIENCES = ["private", "friends", "public"] as const
export type Audience = (typeof AUDIENCES)[number]
/** Breadth order: public > friends > private. A parent must dominate every child. */
const AUDIENCE_BREADTH: Record<Audience, number> = { private: 0, friends: 1, public: 2 }

export function audienceDominates(parent: Audience, child: Audience) {
  return AUDIENCE_BREADTH[child] <= AUDIENCE_BREADTH[parent]
}

/** Audiences a container may take under this parent, including the parent itself. */
export function audiencesDominatedBy(parent: Audience): Audience[] {
  return AUDIENCES.filter((audience) => audienceDominates(parent, audience))
}
/** Decimal bigint string: database revisions must not lose JS number precision. */
export type SharingRevision = string
/** Verified session identity for a published read: guest, or an authenticated user id. Never taken from request JSON. */
export type PublishedViewer =
  | { kind: "guest" }
  | { kind: "authenticated"; userId: string }

export interface CursorPage<T> {
  entries: T[]
  nextCursor: string | null
  hasMore: boolean
}

export const SHARING_LIMITS = {
  socialPageSize: 20,
  publicPageSize: 20,
  detailPageSize: 20,
  maxChartPoints: 366,
  mediaLifetimeSeconds: 60,
  bioCharacters: 500,
  searchCharacters: 64,
} as const

export interface PublicMedia {
  referenceId: string
  url: string
  /** Null only for validated external links. Uploaded media expires within 60s. */
  expiresAt: string | null
}

/** Only validated theme tokens/fonts; never serialize UserSettings. */
export interface PublicStyle {
  colorScheme: Theme
  headerFontFamily: FontFamilyId | null
  bodyFontFamily: FontFamilyId | null
  borderRadius: string | null
}

export interface PublicIdentity {
  id: string
  /** Owner display name (`users.name`), or Collector-<uuid suffix> when that name is empty. */
  nickname: string
  avatar: PublicMedia | null
}

export interface PublicProfile extends PublicIdentity {
  bio: string
  relationship: Relationship
  sharedStyle: PublicStyle | null
}

export interface PublicBox {
  id: string
  name: string
  description: string | null
  /** Null for top-level boxes. */
  displayParentId: string | null
  hasVisibleChildren: boolean
}

export interface PublicCollectionItem {
  id: string
  name: string
  description: string | null
  thumbnail: PublicMedia | null
  currentValue: number | null
  acquisitionPrice: number | null
  acquisitionDate: string | null
}

export interface PublicWishlistItem {
  id: string
  name: string
  description: string | null
  thumbnail: PublicMedia | null
  expectedPrice: number | null
  /** Omit all target metadata if its collection is invisible. */
  visibleTarget: { id: string; name: string } | null
}

export interface PublicItemDetail<T> {
  item: T
  photos: CursorPage<PublicMedia>
}

/** Bounded aggregate series; opening balances included, totals window-independent. */
export interface PublicBoxStats {
  currentValue: number
  totalAcquisition: number
  valueHistory: Array<{ date: string; value: number }>
  acquisitionHistory: Array<{ date: string; cumulativeAcquisition: number }>
  bucket: "day" | "month" | "year"
}

export interface SharingSettings {
  collectionVisibility: Audience
  shareFinancials: boolean
  wishlistVisibility: Audience
}

export const PRIVATE_SHARING_DEFAULTS: Readonly<SharingSettings> = Object.freeze({
  collectionVisibility: "private",
  shareFinancials: false,
  wishlistVisibility: "private",
})

export interface SharingUpdate extends SharingSettings {
  boxId: string
  applyToDescendants: boolean
  expectedRevision: SharingRevision
  expectedDescendantCount: number
}

export interface OwnerSharingSnapshot {
  /** Stored display name (`users.name`); null when empty so the Collector fallback is used. */
  nickname: string | null
  bio: string
  profileShareStyle: boolean
  root: SharingSettings
  wishlistLinkEnabled: boolean
  wishlistShareToken: string | null
  revision: SharingRevision
  wishlistGuestVisibleCount: number
  wishlistGuestTotalCount: number
}

export interface OwnerSharingUpdate {
  nickname: string | null
  bio: string
  profileShareStyle: boolean
  root: SharingSettings
  wishlistLinkEnabled: boolean
  wishlistShareToken: string | null
  expectedRevision: SharingRevision
}

export type OperationError =
  | { code: "invalid_input"; status: 400 }
  | { code: "authentication_required"; status: 401 }
  | { code: "mutation_forbidden"; status: 403 }
  | { code: "not_found"; status: 404 }
  | { code: "stale_request" | "revision_conflict" | "cursor_reset" | "privacy_conflict" | "idempotency_conflict"; status: 409 }
  | { code: "quota_exceeded"; status: 422 }
  | { code: "rate_limited"; status: 429; retryAfterSeconds: number }
  | { code: "temporarily_unavailable"; status: 503 }

export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: OperationError }

export interface PublicPageRequest {
  cursor?: string
}

export interface PublicDetailRequest {
  photosCursor?: string
}

/** Implement only in server modules. Viewer comes from verified session, never input JSON. */
export interface PublicReadService {
  profile(ownerId: string, viewer: PublishedViewer): Promise<OperationResult<PublicProfile>>
  boxes(ownerId: string, viewer: PublishedViewer, request: PublicPageRequest & { parentId?: string }): Promise<OperationResult<CursorPage<PublicBox>>>
  collectionItems(ownerId: string, viewer: PublishedViewer, request: PublicPageRequest & { boxId?: string }): Promise<OperationResult<CursorPage<PublicCollectionItem>>>
  collectionItem(ownerId: string, viewer: PublishedViewer, itemId: string, request: PublicDetailRequest): Promise<OperationResult<PublicItemDetail<PublicCollectionItem>>>
  wishlist(ownerId: string, viewer: PublishedViewer, request: PublicPageRequest): Promise<OperationResult<CursorPage<PublicWishlistItem>>>
  wishlistItem(ownerId: string, viewer: PublishedViewer, itemId: string, request: PublicDetailRequest): Promise<OperationResult<PublicItemDetail<PublicWishlistItem>>>
  stats(ownerId: string, viewer: PublishedViewer, request: { boxId?: string; fromDate?: string; toDate?: string }): Promise<OperationResult<PublicBoxStats>>
  /** Session owner supplied by the route from the verified session, never from query/body. Implementation MUST call wishlist with GUEST_VIEWER. */
  previewWishlist(sessionOwnerId: string, request: PublicPageRequest): Promise<OperationResult<CursorPage<PublicWishlistItem>>>
  tokenWishlist(token: string, viewer: PublishedViewer, request: PublicPageRequest): Promise<OperationResult<CursorPage<PublicWishlistItem>>>
}

export const GUEST_VIEWER: Readonly<{ kind: "guest" }> = Object.freeze({ kind: "guest" })

export interface SharingMutationService {
  preview(actorId: string, boxId: string): Promise<OperationResult<{ revision: SharingRevision; descendantCount: number; settings: SharingSettings }>>
  update(actorId: string, input: SharingUpdate): Promise<OperationResult<{ revision: SharingRevision }>>
  readOwnerSettings(actorId: string): Promise<OperationResult<OwnerSharingSnapshot>>
  updateOwnerSettings(actorId: string, input: OwnerSharingUpdate): Promise<OperationResult<{
    revision: SharingRevision
    wishlistShareToken: string | null
    wishlistGuestVisibleCount: number
    wishlistGuestTotalCount: number
  }>>
}

export const COPY_JOB_STATES = ["queued", "planning", "copying", "finalizing", "completed", "failed", "cancelled"] as const
export type CopyJobState = (typeof COPY_JOB_STATES)[number]
export type CopyFailureCode = "source_unavailable" | "source_changed" | "media_unavailable" | "quota_exceeded" | "retry_exhausted"
export type CopyJobStatus = {
  id: string
  completedEntries: number
  totalEntries: number
} & (
  | { state: "queued" | "planning" | "copying" | "finalizing"; resultRootId: null; failureCode: null }
  | { state: "completed"; resultRootId: string; failureCode: null }
  | { state: "failed"; resultRootId: null; failureCode: CopyFailureCode }
  | { state: "cancelled"; resultRootId: null; failureCode: null }
)

export interface CopyService {
  enqueue(actorId: string, input: { sourceOwnerId: string; sourceBoxId: string; idempotencyKey: string }): Promise<OperationResult<CopyJobStatus>>
  status(actorId: string, jobId: string): Promise<OperationResult<CopyJobStatus>>
  cancel(actorId: string, jobId: string): Promise<OperationResult<CopyJobStatus>>
}
