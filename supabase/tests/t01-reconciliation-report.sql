-- Read-only T01 clone inventory. No writes. Do not print emails, names, bios, or tokens.
-- Usage: psql -v ON_ERROR_STOP=1 -f supabase/tests/t01-reconciliation-report.sql

\echo '=== inventory ==='
SELECT 'auth.users' AS relation, count(*)::bigint AS n FROM auth.users
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'boxes', count(*) FROM public.boxes
UNION ALL SELECT 'items', count(*) FROM public.items
UNION ALL SELECT 'items_wishlist', count(*) FROM public.items WHERE is_wishlist
UNION ALL SELECT 'photos', count(*) FROM public.photos
UNION ALL SELECT 'tags', count(*) FROM public.tags
UNION ALL SELECT 'item_tags', count(*) FROM public.item_tags
UNION ALL SELECT 'legacy_friendships', count(*) FROM public.friendships
UNION ALL SELECT 'social_friendships', count(*) FROM public.social_friendships
UNION ALL SELECT 'user_blocks', count(*) FROM public.user_blocks
UNION ALL SELECT 'public_profiles', count(*) FROM public.public_profiles
UNION ALL SELECT 'user_settings', count(*) FROM public.user_settings
UNION ALL SELECT 'wish_lists', count(*) FROM public.wish_lists
UNION ALL SELECT 'wish_list_items', count(*) FROM public.wish_list_items
UNION ALL SELECT 'storage.buckets', count(*) FROM storage.buckets
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects
UNION ALL SELECT 'media_assets', count(*) FROM public.media_assets
ORDER BY 1;

\echo '=== legacy friendship pairs ==='
SELECT coalesce(status, '<null>') AS status, count(*)::bigint AS n
FROM public.friendships
GROUP BY status
ORDER BY 1;

SELECT count(*)::bigint AS duplicate_undirected_pairs
FROM (
  SELECT LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
  FROM public.friendships
  GROUP BY 1, 2
  HAVING count(*) > 1
) d;

SELECT count(*)::bigint AS self_friend_rows
FROM public.friendships
WHERE user_id = friend_id;

\echo '=== cross-owner and dangling references ==='
SELECT count(*)::bigint AS cross_owner_parent_boxes
FROM public.boxes child
JOIN public.boxes parent ON parent.id = child.parent_box_id
WHERE child.user_id IS DISTINCT FROM parent.user_id;

SELECT count(*)::bigint AS dangling_parent_boxes
FROM public.boxes child
WHERE child.parent_box_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.boxes parent WHERE parent.id = child.parent_box_id);

SELECT count(*)::bigint AS cross_owner_item_boxes
FROM public.items i
JOIN public.boxes b ON b.id = i.box_id
WHERE i.user_id IS DISTINCT FROM b.user_id;

SELECT count(*)::bigint AS dangling_item_boxes
FROM public.items i
WHERE i.box_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.id = i.box_id);

SELECT count(*)::bigint AS cross_owner_wishlist_targets
FROM public.items i
JOIN public.boxes b ON b.id = i.wishlist_target_box_id
WHERE i.user_id IS DISTINCT FROM b.user_id;

SELECT count(*)::bigint AS dangling_wishlist_targets
FROM public.items i
WHERE i.wishlist_target_box_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.id = i.wishlist_target_box_id);

SELECT count(*)::bigint AS cross_owner_item_tags
FROM public.item_tags it
JOIN public.items i ON i.id = it.item_id
JOIN public.tags t ON t.id = it.tag_id
WHERE i.user_id IS DISTINCT FROM t.user_id;

SELECT count(*)::bigint AS dangling_item_tag_items
FROM public.item_tags it
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id = it.item_id);

SELECT count(*)::bigint AS dangling_item_tag_tags
FROM public.item_tags it
WHERE NOT EXISTS (SELECT 1 FROM public.tags t WHERE t.id = it.tag_id);

\echo '=== hierarchy cycles ==='
WITH RECURSIVE walk AS (
  SELECT
    id AS start_id,
    id,
    parent_box_id,
    ARRAY[id] AS path,
    false AS is_cycle
  FROM public.boxes
  UNION ALL
  SELECT
    w.start_id,
    b.id,
    b.parent_box_id,
    w.path || b.id,
    b.id = ANY (w.path)
  FROM walk w
  JOIN public.boxes b ON b.id = w.parent_box_id
  WHERE NOT w.is_cycle
)
SELECT count(DISTINCT start_id)::bigint AS boxes_in_cycles
FROM walk
WHERE is_cycle;

\echo '=== legacy publication inventory (mapping not applied) ==='
SELECT count(*)::bigint AS boxes_is_public_true
FROM public.boxes
WHERE is_public;

SELECT collection_visibility::text, count(*)::bigint AS n
FROM public.boxes
GROUP BY 1
ORDER BY 1;

SELECT share_financials, count(*)::bigint AS n
FROM public.boxes
GROUP BY 1
ORDER BY 1;

SELECT wishlist_visibility::text, count(*)::bigint AS n
FROM public.boxes
GROUP BY 1
ORDER BY 1;

SELECT wishlist_is_public, count(*)::bigint AS n
FROM public.user_settings
GROUP BY 1
ORDER BY 1;

SELECT root_wishlist_visibility::text, count(*)::bigint AS n
FROM public.user_settings
GROUP BY 1
ORDER BY 1;

SELECT profile_share_style, count(*)::bigint AS n
FROM public.user_settings
GROUP BY 1
ORDER BY 1;

SELECT use_custom_display_name, count(*)::bigint AS n
FROM public.user_settings
GROUP BY 1
ORDER BY 1;

SELECT count(*)::bigint AS settings_with_wishlist_share_token
FROM public.user_settings
WHERE wishlist_share_token IS NOT NULL AND btrim(wishlist_share_token) <> '';

SELECT count(*)::bigint AS wish_lists_is_public_true
FROM public.wish_lists
WHERE is_public;

\echo '=== photos and avatar inventory ==='
SELECT
  count(*) FILTER (WHERE storage_path IS NULL OR btrim(storage_path) = '')::bigint AS photos_missing_storage_path,
  count(*) FILTER (
    WHERE (storage_path IS NULL OR btrim(storage_path) = '')
      AND url IS NOT NULL
      AND url ~* 'supabase\.(co|in)/storage/'
  )::bigint AS photos_supabase_url_without_path,
  count(*) FILTER (
    WHERE storage_path IS NOT NULL
      AND btrim(storage_path) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'item-photos' AND o.name = photos.storage_path
      )
  )::bigint AS photos_path_missing_object_row,
  count(*) FILTER (WHERE asset_id IS NULL)::bigint AS photos_unregistered_assets,
  count(*) FILTER (WHERE url ~* '^https?://')::bigint AS photos_http_url,
  count(*) FILTER (WHERE url ~* 'supabase\.(co|in)/storage/')::bigint AS photos_supabase_url
FROM public.photos;

SELECT
  count(*) FILTER (WHERE avatar_url IS NOT NULL AND btrim(avatar_url) <> '')::bigint AS users_with_avatar_url,
  count(*) FILTER (
    WHERE avatar_url IS NOT NULL
      AND avatar_url ~* 'supabase\.(co|in)/storage/'
  )::bigint AS users_supabase_avatar_url
FROM public.users;

\echo '=== photo URL host classes (no paths) ==='
SELECT
  CASE
    WHEN url ~* 'supabase\.(co|in)/storage/' THEN 'supabase-storage'
    WHEN url ~* '(^|://)([^/]*\.)?imgur\.com' THEN 'imgur'
    WHEN url ~* 'googleusercontent|lh[0-9]\.google' THEN 'google'
    WHEN url ~* 'discordapp|cdn\.discord' THEN 'discord'
    WHEN url ~* 'cloudinary' THEN 'cloudinary'
    WHEN url ~* 'wikimedia|wikipedia' THEN 'wikimedia'
    WHEN url ~* 'amazon|amazonaws|cloudfront' THEN 'amazon'
    ELSE regexp_replace(substring(url from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/]+)'), '^www\.', '')
  END AS host_class,
  count(*)::bigint AS n
FROM public.photos
GROUP BY 1
ORDER BY n DESC, 1;

\echo '=== provisioning gaps (expected until explicit backfill) ==='
SELECT count(*)::bigint AS users_missing_public_profile
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM public.public_profiles p WHERE p.user_id = u.id);

SELECT count(*)::bigint AS users_missing_settings
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_settings s WHERE s.user_id = u.id);
