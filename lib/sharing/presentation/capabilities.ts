/** Presentation affordances only. Services must independently authorize every operation. */
export interface CollectionCapabilities {
  canEdit: boolean
  canDelete: boolean
  canMove: boolean
  canDrag: boolean
  canAcquire: boolean
  canCopyToOwnDashboard: boolean
  canCreate: boolean
  canRename: boolean
  canSelect: boolean
  /** Open a read-only detail surface. Distinct from canEdit. */
  canOpenDetail: boolean
  canShowStats: boolean
  showTags: boolean
  showItemCap: boolean
}

export const READ_ONLY_CAPABILITIES: Readonly<CollectionCapabilities> = Object.freeze({
  canEdit: false,
  canDelete: false,
  canMove: false,
  canDrag: false,
  canAcquire: false,
  canCopyToOwnDashboard: false,
  canCreate: false,
  canRename: false,
  canSelect: false,
  canOpenDetail: false,
  canShowStats: false,
  showTags: false,
  showItemCap: false,
})

export const OWNER_CAPABILITIES: Readonly<CollectionCapabilities> = Object.freeze({
  canEdit: true,
  canDelete: true,
  canMove: true,
  canDrag: true,
  canAcquire: true,
  canCopyToOwnDashboard: false,
  canCreate: true,
  canRename: true,
  canSelect: true,
  canOpenDetail: true,
  canShowStats: true,
  showTags: true,
  showItemCap: true,
})

/** Published-page affordances. Copy is deferred in v1; pass false until T06 exists. */
export function publishedCapabilities(copyAvailable: boolean): Readonly<CollectionCapabilities> {
  return Object.freeze({
    ...READ_ONLY_CAPABILITIES,
    canCopyToOwnDashboard: copyAvailable,
    canShowStats: true,
    canOpenDetail: true,
  })
}

export function hasOwnerMutation(capabilities: CollectionCapabilities): boolean {
  return capabilities.canEdit || capabilities.canDelete || capabilities.canMove
    || capabilities.canDrag || capabilities.canAcquire || capabilities.canCreate
    || capabilities.canRename || capabilities.canSelect || capabilities.showItemCap
}

export function assertPublicCapabilities(capabilities: CollectionCapabilities): void {
  if (hasOwnerMutation(capabilities) || capabilities.showTags) {
    throw new Error("public presentation cannot enable owner mutations or tags")
  }
}
