export interface User {
  id: string
  username: string
  email: string
  /** Display name (from signup or Google name/full_name). */
  name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Box {
  id: string
  user_id: string
  parent_box_id?: string
  name: string
  description?: string
  is_public: boolean
  position: number
  created_at: string
  updated_at: string
  // Computed fields
  total_value?: number
  total_acquisition_cost?: number
  item_count?: number
}

export interface Item {
  id: string
  box_id: string
  user_id: string
  name: string
  description?: string
  thumbnail_url?: string
  current_value?: number
  acquisition_date?: string
  acquisition_price?: number
  is_wishlist: boolean
  expected_price?: number
  position: number
  created_at: string
  updated_at: string
  // Relations
  photos?: Photo[]
  tags?: Tag[]
}

/** Payload for duplicating an item (copy/paste). Same shape as API create body minus id; box_id set on paste. */
export interface ItemCopyPayload {
  name: string
  description?: string | null
  current_value?: number | null
  acquisition_date?: string | null
  acquisition_price?: number | null
  expected_price?: number | null
  thumbnail_url?: string | null
  is_wishlist: boolean
  photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
  tag_ids: string[]
}

export interface Photo {
  id: string
  item_id: string
  url: string
  storage_path?: string // Storage path for Supabase storage files
  is_thumbnail: boolean
  uploaded_at: string
}

export const TAG_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const
export type TagColor = (typeof TAG_COLORS)[number]

export interface Tag {
  id: string
  user_id: string
  name: string
  color: TagColor
  created_at: string
  updated_at?: string
}

export interface ValueHistory {
  id: string
  item_id: string
  value: number
  recorded_at: string
}

export interface Friendship {
  id: string
  user_id: string
  friend_id: string
  status: "pending" | "accepted" | "blocked"
  created_at: string
}

export interface WishList {
  id: string
  user_id: string
  name: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface Theme {
  background?: string
  foreground?: string
  card?: string
  cardForeground?: string
  popover?: string
  popoverForeground?: string
  /** Highlight for selected item cards (multi-select). */
  itemSelected?: string
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
  muted?: string
  mutedForeground?: string
  accent?: string
  accentForeground?: string
  destructive?: string
  destructiveForeground?: string
  border?: string
  input?: string
  ring?: string
  // Value-related colors
  valueColor?: string // Color for displaying current values
  acquisitionColor?: string // Color for displaying acquisition prices
  graphValueColor?: string // Color for value lines in graphs
  graphAcquisitionColor?: string // Color for acquisition lines in graphs
  graphAxisColor?: string // Axis lines and tick labels
  graphGridColor?: string // Grid/divider lines in graph
  graphTooltipBackground?: string // Tooltip background when hovering
  graphTooltipForeground?: string // Tooltip text color
  thumbnailColor?: string // Thumbnail fill (star and badge background in item dialog)
  thumbnailForeground?: string // Thumbnail badge text and icon color
  thumbnailHighlight?: string // Hover background for thumbnail overlay icons (star)
  thumbnailHover?: string // Hover icon color
  radius?: string // Border radius for cards, buttons, inputs (e.g. "0.5rem")
  /** When true, draw value and acquisition lines on one chart; when false, two separate charts. */
  graphOverlay?: boolean
  // Tag colors (theme-customizable; used for tag chips)
  tagRed?: string
  tagOrange?: string
  tagYellow?: string
  tagGreen?: string
  tagBlue?: string
  tagIndigo?: string
  tagViolet?: string
  /** Text color inside tag chips (all tags use this). */
  tagForeground?: string
}

/** State for advanced search filters. Used by dashboard and search page. */
export interface SearchFiltersState {
  includeTags: string[]
  excludeTags: string[]
  valueMin: string
  valueMax: string
  acquisitionMin: string
  acquisitionMax: string
  dateFrom: string
  dateTo: string
  tagColors: string[]
}

export const DEFAULT_SEARCH_FILTERS: SearchFiltersState = {
  includeTags: [],
  excludeTags: [],
  valueMin: "",
  valueMax: "",
  acquisitionMin: "",
  acquisitionMax: "",
  dateFrom: "",
  dateTo: "",
  tagColors: [],
}

export function hasAnySearchFilter(f: SearchFiltersState): boolean {
  return (
    f.includeTags.length > 0 ||
    f.excludeTags.length > 0 ||
    f.valueMin !== "" ||
    f.valueMax !== "" ||
    f.acquisitionMin !== "" ||
    f.acquisitionMax !== "" ||
    f.dateFrom !== "" ||
    f.dateTo !== "" ||
    f.tagColors.length > 0
  )
}

export interface UserSettings {
  user_id: string
  color_scheme?: Theme | null
  /** Font family key (e.g. Inter, Geist). Stored separately from theme colors. */
  font_family?: string | null
  /** Border radius (e.g. 0.5rem). Stored separately from theme colors. */
  border_radius?: string | null
  /** When true, draw value and acquisition on one chart; when false, two separate. Stored separately from theme colors. */
  graph_overlay?: boolean | null
  wishlist_is_public: boolean
  wishlist_share_token?: string | null
  wishlist_apply_colors: boolean
  /** When true, show public.users.name; when false, show provider name (e.g. Google). */
  use_custom_display_name?: boolean
  created_at: string
  updated_at: string
}
