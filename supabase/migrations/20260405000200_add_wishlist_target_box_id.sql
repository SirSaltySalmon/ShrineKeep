ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS wishlist_target_box_id UUID REFERENCES public.boxes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'items_wishlist_target_requires_wishlist'
      AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_wishlist_target_requires_wishlist
      CHECK (wishlist_target_box_id IS NULL OR is_wishlist = true);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_items_wishlist_target_box_id
  ON public.items(wishlist_target_box_id) WHERE is_wishlist = true;
