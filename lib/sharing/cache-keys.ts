import type { PublishedViewer, SharingRevision } from "./contracts"

/** Paginated or keyed public surface used to partition browser caches. Aligns with RPC surface names. */
export type PublicSurface = "profile" | "boxes" | "items" | "wishlist" | "item-detail" | "stats" | "media"
/** Cache identity for one public read: surface plus optional box/item/query/revision. */
export interface ReadScope {
  surface: PublicSurface
  boxId?: string
  itemId?: string
  query?: string
  sort?: string
  filters?: Readonly<Record<string, string | boolean | number | null>>
  cursor?: string
  revision?: SharingRevision
}

export type SocialReadScope =
  | { surface: "requests"; direction: "incoming" | "outgoing"; cursor?: string }
  | { surface: "friends"; query: string; cursor?: string }
  | { surface: "notifications" | "blocks"; cursor?: string }

/** Browser cache partition only. Logout/account switch/block must also evict old queries. */
export const sharingKeys = {
  owner: (ownerId: string, scope: ReadScope) => ["sharing-owner", ownerId, scope] as const,
  public: (ownerId: string, viewer: PublishedViewer, scope: ReadScope) =>
    ["sharing-public", ownerId, viewer.kind === "guest" ? "guest" : viewer.userId, scope] as const,
  /** `sessionOwnerId` is the verified account, never a public `ownerId` from the URL. */
  preview: (sessionOwnerId: string, scope: Omit<ReadScope, "surface">) =>
    ["sharing-preview", sessionOwnerId, "guest", { ...scope, surface: "wishlist" }] as const,
  social: (actorId: string, scope: SocialReadScope) => ["social", actorId, scope] as const,
}
