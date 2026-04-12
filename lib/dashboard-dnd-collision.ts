import type { CollisionDetection } from "@dnd-kit/core"
import { pointerWithin, rectIntersection } from "@dnd-kit/core"

/**
 * Prefer droppables under the pointer/finger (`pointerWithin`). If several overlap there,
 * pick the smallest rect so narrow targets (breadcrumbs) win over wide ones.
 * If the pointer is not inside any droppable, fall back to `rectIntersection` with the
 * dragged item so box cards still behave as before.
 */
export const dashboardDndCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) {
    if (pointerHits.length === 1) return pointerHits
    const { droppableContainers } = args
    const sorted = [...pointerHits].sort((a, b) => {
      const rectA = droppableContainers.find((d) => d.id === a.id)?.rect.current
      const rectB = droppableContainers.find((d) => d.id === b.id)?.rect.current
      const areaA = rectA != null ? rectA.width * rectA.height : Number.POSITIVE_INFINITY
      const areaB = rectB != null ? rectB.width * rectB.height : Number.POSITIVE_INFINITY
      return areaA - areaB
    })
    return [sorted[0]]
  }

  return rectIntersection(args)
}
