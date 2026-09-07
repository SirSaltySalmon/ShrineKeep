import type { Audience } from "../contracts"

/** Reference model for SQL/service parity tests. Never use as a browser authorization layer. */
export const VIEWER_CASES = ["owner", "friend", "stranger", "blocked", "guest"] as const
export type FixtureViewer = (typeof VIEWER_CASES)[number]
export interface FixtureAccount { active: boolean; sandbox: boolean; pendingDeletion: boolean }
export const ACCOUNTS: Record<"owner" | "sandbox" | "inactive" | "deleting", FixtureAccount> = {
  owner: { active: true, sandbox: false, pendingDeletion: false },
  sandbox: { active: true, sandbox: true, pendingDeletion: false },
  inactive: { active: false, sandbox: false, pendingDeletion: false },
  deleting: { active: true, sandbox: false, pendingDeletion: true },
}

export function expectedAudience(audience: Audience, viewer: FixtureViewer, account = ACCOUNTS.owner): boolean {
  if (!account.active || account.sandbox || account.pendingDeletion || viewer === "blocked") return false
  return audience === "public" || (audience === "friends" && (viewer === "owner" || viewer === "friend"))
}

export interface WishlistFixture {
  isWishlist: boolean
  explicitlyPrivate: boolean
  target: { collection: Audience; wishlist: Audience; shareFinancials: boolean } | null
  detached: Audience | null
  root: Audience
  expectedPrice: number | null
}

export function expectedWishlist(item: WishlistFixture, viewer: FixtureViewer, account = ACCOUNTS.owner): boolean {
  return item.isWishlist && !item.explicitlyPrivate && expectedAudience(item.target?.wishlist ?? item.detached ?? item.root, viewer, account)
}

export const PRIVATE_GAP = [
  { id: "A", parentId: null, audience: "public" },
  { id: "B", parentId: "A", audience: "private" },
  { id: "C", parentId: "B", audience: "public" },
  { id: "D", parentId: "C", audience: "friends" },
] as const

export function expectedHierarchy(viewer: FixtureViewer) {
  const visible = PRIVATE_GAP.filter(box => expectedAudience(box.audience, viewer))
  return visible.map(box => ({
    id: box.id,
    displayParentId: visible.some(parent => parent.id === box.parentId) ? box.parentId : null,
  }))
}
