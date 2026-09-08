-- T01 privacy gate: revoke the legacy Data API / Storage SELECT policies that
-- published emails, financials, wishlist tokens, and every wishlist photo blob.
-- Canonical public reads go through service-only RPCs. Keep this file as DROP
-- only — do not recreate substitutes.
--
-- Keep "Public can view avatars". Avatars stay world-readable for v1 by
-- product decision, not because this migration forgot them.

DROP POLICY IF EXISTS "Users can view public profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view public boxes" ON public.boxes;
DROP POLICY IF EXISTS "Users can view items in public boxes" ON public.items;
DROP POLICY IF EXISTS "Public can view wishlist items for public wishlists" ON public.items;
DROP POLICY IF EXISTS "Users can view photos in public items" ON public.photos;
DROP POLICY IF EXISTS "Public can view photos for wishlist items in public wishlists" ON public.photos;
DROP POLICY IF EXISTS "Users can view public wish lists of friends" ON public.wish_lists;
DROP POLICY IF EXISTS "Public can view settings for public wishlists" ON public.user_settings;
DROP POLICY IF EXISTS "Users can view wishlist item photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view wishlist item photos" ON storage.objects;
