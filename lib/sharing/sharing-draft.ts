import type { Audience, SharingSettings } from "./contracts"

export interface SharingDraft extends SharingSettings {
  wishlistEdited: boolean
  applyToDescendants: boolean
}

export function openSharingDraft(saved: SharingSettings): SharingDraft {
  return { ...saved, wishlistEdited: false, applyToDescendants: true }
}

export function chooseCollection(draft: SharingDraft, audience: Audience): SharingDraft {
  return {
    ...draft,
    collectionVisibility: audience,
    wishlistVisibility: draft.wishlistEdited ? draft.wishlistVisibility : audience,
  }
}

export function chooseWishlist(draft: SharingDraft, audience: Audience): SharingDraft {
  return { ...draft, wishlistVisibility: audience, wishlistEdited: true }
}
