import type { ItemCopyPayload, TagColor } from "@/lib/types"

/** Stable skeleton UUIDs — must match boneyard fixtures and bones previews. */
export const DEMO_SKELETON_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

export const DEMO_SKELETON_TAG_UUIDS = [
  "11111111-1111-1111-1111-111111111101",
  "11111111-1111-1111-1111-111111111102",
  "11111111-1111-1111-1111-111111111103",
  "11111111-1111-1111-1111-111111111104",
] as const

export const DEMO_SKELETON_BOX_IDS = {
  SHONEN: "22222222-2222-2222-2222-222222222201",
  COLLECTOR: "22222222-2222-2222-2222-222222222202",
  REORG: "22222222-2222-2222-2222-222222222203",
  VAULT: "22222222-2222-2222-2222-222222222204",
} as const

export type DemoSkeletonBoxId =
  (typeof DEMO_SKELETON_BOX_IDS)[keyof typeof DEMO_SKELETON_BOX_IDS]

export const DEMO_PLACEHOLDER_PRIMARY =
  "https://placehold.co/400x600/e2e8f0/64748b?text=Demo"

export const DEMO_PLACEHOLDER_SECONDARY =
  "https://placehold.co/400x600/f1f5f9/94a3b8?text=Gallery"

export const DEMO_TAG_SPECS: readonly { name: string; color: TagColor }[] = [
  { name: "Rare", color: "red" },
  { name: "Display", color: "blue" },
  { name: "Mint", color: "green" },
  { name: "First Ed", color: "violet" },
]

export function demoItemPhotos(): { url: string; is_thumbnail: boolean }[] {
  return [
    { url: DEMO_PLACEHOLDER_PRIMARY, is_thumbnail: true },
    { url: DEMO_PLACEHOLDER_SECONDARY, is_thumbnail: false },
  ]
}

export const DEMO_BOX_ROWS: readonly {
  skeletonId: DemoSkeletonBoxId
  name: string
  description: string
  position: number
}[] = [
  {
    skeletonId: DEMO_SKELETON_BOX_IDS.SHONEN,
    name: "Shonen Shelf",
    description: "Public-facing display shelf and rotation.",
    position: 0,
  },
  {
    skeletonId: DEMO_SKELETON_BOX_IDS.COLLECTOR,
    name: "Collector Editions",
    description: "Signed volumes and small-run prints stored upright.",
    position: 1,
  },
  {
    skeletonId: DEMO_SKELETON_BOX_IDS.REORG,
    name: "To Reorganize",
    description: "Working pile before final homes are decided.",
    position: 2,
  },
  {
    skeletonId: DEMO_SKELETON_BOX_IDS.VAULT,
    name: "Vault Overflow",
    description: "Staging for photography, QA, and re-tagging.",
    position: 3,
  },
]

export interface DemoCollectionSeedSpec {
  skeletonBoxId: DemoSkeletonBoxId
  name: string
  description: string
  current_value: number
  acquisition_date: string
  acquisition_price: number
  position: number
  tagNames: string[]
  value_history: { value: number; recorded_at: string }[]
}

export const DEMO_COLLECTION_ITEM_SPECS: readonly DemoCollectionSeedSpec[] = [
  {
    skeletonBoxId: DEMO_SKELETON_BOX_IDS.SHONEN,
    name: "One Piece Vol. 1 (Gold Foil)",
    description: "First-print foil with acrylic case and grading notes.",
    current_value: 420.5,
    acquisition_date: "2025-04-12",
    acquisition_price: 280,
    position: 0,
    tagNames: ["Rare", "Display", "Mint"],
    value_history: [
      { value: 280, recorded_at: "2025-04-12T12:00:00.000Z" },
      { value: 350, recorded_at: "2025-08-01T12:00:00.000Z" },
      { value: 420.5, recorded_at: "2026-01-10T12:00:00.000Z" },
    ],
  },
  {
    skeletonBoxId: DEMO_SKELETON_BOX_IDS.SHONEN,
    name: "Naruto Box Set 2 (Wide Spine)",
    description: "Volumes 28–48 with publisher sleeves and index card.",
    current_value: 199.99,
    acquisition_date: "2024-10-03",
    acquisition_price: 260.25,
    position: 1,
    tagNames: ["Mint", "First Ed"],
    value_history: [
      { value: 260.25, recorded_at: "2024-10-03T12:00:00.000Z" },
      { value: 199.99, recorded_at: "2026-01-05T12:00:00.000Z" },
    ],
  },
  {
    skeletonBoxId: DEMO_SKELETON_BOX_IDS.COLLECTOR,
    name: "Berserk Deluxe Edition 01",
    description: "Hardcover omnibus, near-mint dust jacket and corners.",
    current_value: 58,
    acquisition_date: "2025-01-20",
    acquisition_price: 44.99,
    position: 2,
    tagNames: ["Display"],
    value_history: [
      { value: 44.99, recorded_at: "2025-01-20T12:00:00.000Z" },
      { value: 52, recorded_at: "2025-06-15T12:00:00.000Z" },
      { value: 58, recorded_at: "2026-01-08T12:00:00.000Z" },
    ],
  },
  {
    skeletonBoxId: DEMO_SKELETON_BOX_IDS.REORG,
    name: "Chainsaw Man Vol. 11 Alt Cover",
    description: "Retailer variant with obi strip and bonus postcard.",
    current_value: 36.5,
    acquisition_date: "2025-06-15",
    acquisition_price: 25,
    position: 3,
    tagNames: ["Rare", "First Ed", "Display"],
    value_history: [
      { value: 25, recorded_at: "2025-06-15T12:00:00.000Z" },
      { value: 36.5, recorded_at: "2025-12-01T12:00:00.000Z" },
    ],
  },
]

export interface DemoWishlistSeedSpec {
  skeletonTargetBoxId: DemoSkeletonBoxId
  name: string
  description: string
  expected_price: number
  position: number
  tagNames: string[]
}

export const DEMO_WISHLIST_ITEM_SPECS: readonly DemoWishlistSeedSpec[] = [
  {
    skeletonTargetBoxId: DEMO_SKELETON_BOX_IDS.COLLECTOR,
    name: "Vagabond VizBig Vol. 5",
    description: "Watching auctions and friend sales for a clean copy.",
    expected_price: 29.99,
    position: 0,
    tagNames: ["Rare"],
  },
  {
    skeletonTargetBoxId: DEMO_SKELETON_BOX_IDS.SHONEN,
    name: "Dandadan Vol. 8 (Limited Cover)",
    description: "Prefer the glow-in-the-dark cover when it restocks.",
    expected_price: 18.5,
    position: 1,
    tagNames: ["Mint"],
  },
  {
    skeletonTargetBoxId: DEMO_SKELETON_BOX_IDS.VAULT,
    name: "Akira 35th Anniversary Box Set",
    description: "Boxed set with prints and booklet; must ship insured.",
    expected_price: 165,
    position: 2,
    tagNames: ["Display"],
  },
]

function tagIdsForNames(
  names: string[],
  tagIdsByName: Map<string, string>
): string[] {
  const out: string[] = []
  for (const n of names) {
    const id = tagIdsByName.get(n)
    if (id) out.push(id)
  }
  return out
}

export function collectionItemToCopyPayload(
  spec: DemoCollectionSeedSpec,
  tagIdsByName: Map<string, string>
): ItemCopyPayload {
  return {
    name: spec.name,
    description: spec.description,
    current_value: spec.current_value,
    acquisition_date: spec.acquisition_date,
    acquisition_price: spec.acquisition_price,
    expected_price: null,
    thumbnail_url: DEMO_PLACEHOLDER_PRIMARY,
    is_wishlist: false,
    wishlist_target_box_id: null,
    photos: demoItemPhotos(),
    tag_ids: tagIdsForNames(spec.tagNames, tagIdsByName),
    value_history: spec.value_history,
  }
}

export function wishlistItemToCopyPayload(
  spec: DemoWishlistSeedSpec,
  tagIdsByName: Map<string, string>
): ItemCopyPayload {
  return {
    name: spec.name,
    description: spec.description,
    current_value: null,
    acquisition_date: null,
    acquisition_price: null,
    expected_price: spec.expected_price,
    thumbnail_url: DEMO_PLACEHOLDER_PRIMARY,
    is_wishlist: true,
    wishlist_target_box_id: null,
    photos: demoItemPhotos(),
    tag_ids: tagIdsForNames(spec.tagNames, tagIdsByName),
    value_history: [],
  }
}
