"use client"

import { createContext, useContext, useSyncExternalStore } from "react"
import {
  CARD_DENSITY_STORAGE_KEY,
  createCardDensityStore,
  type CardDensity,
} from "@/lib/card-density"

/** The one density store for this browser tab. Every grid and the toggle read it. */
const cardDensityStore = createCardDensityStore({
  getStorage: () => (typeof window === "undefined" ? null : window.localStorage),
  watchStorage: (onExternalChange) => {
    // Fires in other tabs only, which is what keeps two open dashboards in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CARD_DENSITY_STORAGE_KEY) onExternalChange()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  },
})

const CardDensityOverrideContext = createContext<CardDensity | null>(null)

/**
 * Pins the density for everything below it, whatever this device has stored. Only the
 * boneyard preview pages use it, so each density's skeletons can be captured from a fixed
 * URL without touching the stored preference.
 */
export const CardDensityOverride = CardDensityOverrideContext.Provider

/**
 * This device's card density. The server and the hydration render always get
 * `comfortable`; a stored `compact` is applied right after hydration, so there is no
 * hydration mismatch.
 */
export function useCardDensity(): CardDensity {
  const override = useContext(CardDensityOverrideContext)
  const stored = useSyncExternalStore(
    cardDensityStore.subscribe,
    cardDensityStore.getSnapshot,
    cardDensityStore.getServerSnapshot
  )
  return override ?? stored
}

export function setCardDensity(next: CardDensity): void {
  cardDensityStore.set(next)
}
