"use client"

export function WishlistVisibilitySummary({
  visibleCount,
  totalCount,
}: {
  visibleCount: number
  totalCount: number
}) {
  return (
    <p className="text-fluid-sm text-muted-foreground">
      {visibleCount} of {totalCount} wishlist {totalCount === 1 ? "item is" : "items are"} visible to a
      signed-out visitor. Change visibility on Wishlist by editing individual boxes and the root
      (items not in a box). Turning the share link off does not hide these items on your profile.
    </p>
  )
}
