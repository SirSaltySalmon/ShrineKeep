BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('a1000000-0000-4000-8000-000000000001', 'backfill-owner@test.invalid', '{"username":"backfill-owner"}');
INSERT INTO public.public_profiles (user_id) VALUES ('a1000000-0000-4000-8000-000000000001');
INSERT INTO public.boxes (id, user_id, name) VALUES
 ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'backfill box');
INSERT INTO public.items (id, user_id, name, box_id) VALUES
 ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'backfill item', 'a2000000-0000-4000-8000-000000000001');
INSERT INTO public.photos (id, item_id, url, storage_path) VALUES
 ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
  'https://example.test/storage/v1/object/public/item-photos/a1000000-0000-4000-8000-000000000001/items/a.jpg',
  'a1000000-0000-4000-8000-000000000001/items/a.jpg'),
 ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
  'https://cdn.example.test/external.png', NULL),
 ('a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000001',
  'https://example.test/storage/v1/object/public/item-photos/not-this-owner/items/b.jpg',
  'not-this-owner/items/b.jpg');
UPDATE public.users SET avatar_url = 'https://example.test/storage/v1/object/public/avatars/a1000000-0000-4000-8000-000000000001/avatar.jpg'
 WHERE id = 'a1000000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  response jsonb;
  photo_asset uuid;
BEGIN
  response := public.media_backfill_legacy_assets(50);
  PERFORM pg_temp.assert_true((response->>'ok')::boolean, 'backfill ok');
  PERFORM pg_temp.assert_true((response->'data'->>'photosRegistered')::integer = 1, 'one photo registered');
  PERFORM pg_temp.assert_true((response->'data'->>'avatarsRegistered')::integer = 1, 'avatar registered');
  PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'failures') = 1, 'unresolvable photo reported');
  PERFORM pg_temp.assert_true(response->'data'->'failures'->0->>'id' = 'a4000000-0000-4000-8000-000000000003', 'failure names photo id');

  SELECT asset_id INTO photo_asset FROM public.photos WHERE id = 'a4000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(photo_asset IS NOT NULL, 'registered photo has asset_id');
  PERFORM pg_temp.assert_true(
    (SELECT asset_id FROM public.photos WHERE id = 'a4000000-0000-4000-8000-000000000002') IS NULL,
    'external url is not a storage backfill target'
  );
  PERFORM pg_temp.assert_true(
    (SELECT avatar_asset_id FROM public.public_profiles WHERE user_id = 'a1000000-0000-4000-8000-000000000001') IS NOT NULL,
    'legacy avatar attached'
  );

  response := public.media_backfill_legacy_assets(50);
  PERFORM pg_temp.assert_true((response->'data'->>'photosProcessed')::integer = 1, 'restartable: unresolved photo remains');
  PERFORM pg_temp.assert_true((response->'data'->>'photosRegistered')::integer = 0, 'already-registered photos skipped');

  response := public.media_queue_owner_purge('a1000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true((response->>'ok')::boolean, 'owner purge queues');
  PERFORM pg_temp.assert_true(
    (SELECT asset_id FROM public.photos WHERE id = 'a4000000-0000-4000-8000-000000000001') IS NULL,
    'purge detaches photo refs'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.media_gc_queue q
      JOIN public.media_assets a ON a.id = q.asset_id
      WHERE a.owner_id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'purge enqueues owner assets'
  );
END $$;
RESET ROLE;
ROLLBACK;
