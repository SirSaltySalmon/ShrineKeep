/** Presentation affordances only. Services must independently authorize every operation. */
export interface CollectionCapabilities {
  canEdit: boolean
  canDelete: boolean
  canMove: boolean
  canDrag: boolean
  canAcquire: boolean
  canCopyToOwnDashboard: boolean
}

export const READ_ONLY_CAPABILITIES: Readonly<CollectionCapabilities> = Object.freeze({
  canEdit: false,
  canDelete: false,
  canMove: false,
  canDrag: false,
  canAcquire: false,
  canCopyToOwnDashboard: false,
})

export function publishedCapabilities(copyAvailable: boolean): Readonly<CollectionCapabilities> {
  return Object.freeze({ ...READ_ONLY_CAPABILITIES, canCopyToOwnDashboard: copyAvailable })
}
