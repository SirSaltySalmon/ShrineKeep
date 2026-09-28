BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('71000000-0000-4000-8000-000000000001', 'media-owner@test.invalid', '{"username":"media-owner"}'),
 ('71000000-0000-4000-8000-000000000002', 'media-friend@test.invalid', '{"username":"media-friend"}'),
 ('71000000-0000-4000-8000-000000000003', 'media-blocked@test.invalid', '{"username":"media-blocked"}');
INSERT INTO public.public_profiles (user_id) SELECT id FROM public.users
  WHERE id IN ('71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003');
INSERT INTO public.social_friendships (user_low, user_high, requested_by, status, accepted_at) VALUES
 ('71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'accepted', now());
INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES
 ('71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000001');
INSERT INTO public.boxes (id, user_id, name) VALUES
 ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'media box'),
 ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'private wish box');
UPDATE public.user_settings SET root_collection_visibility = 'public', root_wishlist_visibility = 'public'
 WHERE user_id = '71000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET collection_visibility = 'public', wishlist_visibility = 'public'
  WHERE id = '72000000-0000-4000-8000-000000000001';
INSERT INTO public.items (id, user_id, name, box_id) VALUES
 ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'owned item', '72000000-0000-4000-8000-000000000001');
INSERT INTO public.items (id, user_id, name, is_wishlist, wishlist_target_box_id) VALUES
 ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'wish item', true, '72000000-0000-4000-8000-000000000001'),
 ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000001', 'private-box wish', true, '72000000-0000-4000-8000-000000000002');
INSERT INTO public.photos (id, item_id, url, storage_path) VALUES
 ('74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
  'https://example.test/storage/v1/object/public/item-photos/71000000-0000-4000-8000-000000000001/items/a.jpg',
  '71000000-0000-4000-8000-000000000001/items/a.jpg'),
 ('74000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002',
  'https://cdn.example.test/external.png', NULL),
 ('74000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000003',
  'https://cdn.example.test/private.png', NULL);

SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner_id uuid := '71000000-0000-4000-8000-000000000001';
  friend_id uuid := '71000000-0000-4000-8000-000000000002';
  blocked_id uuid := '71000000-0000-4000-8000-000000000003';
  photo_id uuid := '74000000-0000-4000-8000-000000000001';
  wish_photo uuid := '74000000-0000-4000-8000-000000000002';
  private_photo uuid := '74000000-0000-4000-8000-000000000003';
  response jsonb;
  registered_id uuid;
  second_photo uuid := '74000000-0000-4000-8000-000000000004';
  job_id uuid;
  avatar_id uuid;
BEGIN
  response := public.media_authorize_reference('photo', photo_id, NULL);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found', 'unregistered upload is not signed');
  response := public.media_register_legacy_photo(photo_id);
  PERFORM pg_temp.assert_true((response->>'ok')::boolean, 'legacy registration');
  registered_id := (response->'data'->>'assetId')::uuid;
  response := public.media_authorize_reference('photo', photo_id, NULL);
  PERFORM pg_temp.assert_true(response->'data'->>'kind' = 'uploaded' AND response->'data'->>'bucket' = 'item-photos', 'guest public owned photo');
  PERFORM pg_temp.assert_true(response::text NOT LIKE '%email%' AND response->'data'->>'objectPath' = owner_id::text || '/items/a.jpg', 'path allowlist');
  response := public.media_authorize_reference('photo', photo_id, blocked_id);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found', 'blocked viewer denied');
  response := public.media_authorize_reference('photo', wish_photo, NULL);
  PERFORM pg_temp.assert_true(response->'data'->>'kind' = 'external' AND response->'data'->>'externalUrl' = 'https://cdn.example.test/external.png', 'external link');
  response := public.media_authorize_reference('photo', private_photo, NULL);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found', 'private-box wishlist photo denied');
  response := public.media_authorize_reference('photo', wish_photo, friend_id);
  PERFORM pg_temp.assert_true(response->'data'->>'kind' = 'external', 'friend still sees public wishlist photo');

  INSERT INTO public.photos (id, item_id, url, storage_path)
    VALUES (second_photo, '73000000-0000-4000-8000-000000000001', 'https://example.test/a.jpg', owner_id::text || '/items/a.jpg');
  response := public.media_register_legacy_photo(second_photo);
  PERFORM pg_temp.assert_true(response->'data'->>'assetId' = registered_id::text, 'shared path reuses asset');

  DELETE FROM public.photos WHERE id = photo_id;
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.media_gc_queue q WHERE q.asset_id = registered_id), 'remaining reference skips GC queue');

  DELETE FROM public.photos WHERE id = second_photo;
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM public.media_gc_queue q WHERE q.asset_id = registered_id), 'last reference enqueues GC');
  response := public.media_claim_gc(10);
  PERFORM pg_temp.assert_true(response->'data'->'assets'->0->>'id' = registered_id::text, 'unreferenced asset claimed');
  PERFORM pg_temp.assert_true((SELECT state FROM public.media_assets WHERE id = registered_id) = 'deleting', 'claimed asset is deleting');
  response := public.media_complete_gc(registered_id, (response->'data'->'assets'->0->>'claimToken')::uuid, true);
  PERFORM pg_temp.assert_true(response->'data'->>'state' = 'deleted', 'GC tombstone');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.media_gc_queue q WHERE q.asset_id = registered_id), 'queue cleared');

  response := public.media_register_asset(owner_id, 'item-photos', owner_id::text || '/items/leased.jpg', 'image/jpeg', 12, 'ready');
  registered_id := (response->'data'->>'assetId')::uuid;
  INSERT INTO public.photos (id, item_id, url, storage_path, asset_id)
    VALUES ('74000000-0000-4000-8000-000000000005', '73000000-0000-4000-8000-000000000001',
      'https://example.test/leased.jpg', owner_id::text || '/items/leased.jpg', registered_id);
  INSERT INTO public.copy_jobs (id, requester_id, source_owner_id, source_root_box_id, idempotency_key, payload_hash, state)
    VALUES ('75000000-0000-4000-8000-000000000001', friend_id, owner_id, '72000000-0000-4000-8000-000000000001', 'copy-1', 'hash-1', 'copying')
    RETURNING id INTO job_id;
  response := public.media_lease_asset(job_id, registered_id, 60);
  PERFORM pg_temp.assert_true((response->>'ok')::boolean, 'lease created');
  DELETE FROM public.photos WHERE id = '74000000-0000-4000-8000-000000000005';
  response := public.media_claim_gc(10);
  PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'assets') = 0, 'lease prevents GC');
  PERFORM pg_temp.assert_true((SELECT state FROM public.media_assets WHERE id = registered_id) = 'ready', 'leased asset stays ready');
  response := public.media_release_lease(job_id, registered_id);
  response := public.media_claim_gc(10);
  PERFORM pg_temp.assert_true(response->'data'->'assets'->0->>'id' = registered_id::text, 'released lease allows GC');
  PERFORM pg_temp.assert_true((SELECT public.media_complete_gc(registered_id, (response->'data'->'assets'->0->>'claimToken')::uuid, true)->'data'->>'state') = 'deleted', 'finalize after lease');

  response := public.media_register_asset(owner_id, 'avatars', owner_id::text || '/avatars/v1.jpg', 'image/png', 12, 'pending');
  avatar_id := (response->'data'->>'assetId')::uuid;
  response := public.media_attach_avatar(owner_id, avatar_id);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found', 'pending avatar cannot attach');
  PERFORM pg_temp.assert_true((public.media_finalize_upload(avatar_id)->'data'->>'state') = 'ready', 'finalize upload');
  response := public.media_attach_avatar(owner_id, avatar_id);
  PERFORM pg_temp.assert_true((response->>'ok')::boolean, 'ready avatar attaches');
  response := public.media_authorize_reference('avatar', owner_id, NULL);
  PERFORM pg_temp.assert_true(response->'data'->>'bucket' = 'avatars', 'guest avatar authorized');
  response := public.media_authorize_reference('avatar', owner_id, blocked_id);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found', 'blocked avatar denied');
  UPDATE public.public_profiles SET avatar_asset_id = NULL WHERE user_id = owner_id;
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM public.media_gc_queue q WHERE q.asset_id = avatar_id), 'avatar removal enqueues GC');

  BEGIN
    INSERT INTO public.photos (item_id, url, storage_path, asset_id)
      VALUES ('73000000-0000-4000-8000-000000000001', 'https://example.test/x', owner_id::text || '/items/forged.jpg', avatar_id);
    RAISE EXCEPTION 'forged avatar asset attached to photo';
  EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.media_authorize_reference('photo', '74000000-0000-4000-8000-000000000002', NULL);
    RAISE EXCEPTION 'anon called service-only media authorize';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.media_assets (owner_id, bucket, object_path, mime, byte_size, state)
      VALUES ('71000000-0000-4000-8000-000000000001', 'item-photos', '71000000-0000-4000-8000-000000000001/items/direct.jpg', 'image/jpeg', 1, 'ready');
    RAISE EXCEPTION 'authenticated inserted media_assets';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
