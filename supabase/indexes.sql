-- For items filtered by box and user
CREATE INDEX IF NOT EXISTS idx_items_box_user ON public.items(box_id, user_id) WHERE box_id IS NOT NULL;

-- For items filtered by user and wishlist status
CREATE INDEX IF NOT EXISTS idx_items_user_wishlist ON public.items(user_id, is_wishlist);

-- For value_history queries ordered by date
CREATE INDEX IF NOT EXISTS idx_value_history_item_recorded ON public.value_history(item_id, recorded_at DESC);

-- Improve hot-path reads for dashboard and search workloads.
-- Safe to run repeatedly due IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_items_user_box_wishlist_position
  ON public.items (user_id, box_id, is_wishlist, position);

CREATE INDEX IF NOT EXISTS idx_items_user_wishlist_target
  ON public.items (user_id, wishlist_target_box_id)
  WHERE is_wishlist = true;

CREATE INDEX IF NOT EXISTS idx_boxes_user_parent_position
  ON public.boxes (user_id, parent_box_id, position);
