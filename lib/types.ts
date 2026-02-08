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

export interface Photo {
  id: string
  item_id: string
  url: string
  is_thumbnail: boolean
  uploaded_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  created_at: string
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
