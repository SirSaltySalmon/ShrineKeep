BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('d1000000-0000-4000-8000-000000000001', 'owner-media@test.invalid', '{"username":"owner-media"}'),
 ('d1000000-0000-4000-8000-000000000002', 'owner-media-other@test.invalid', '{"username":"owner-media-other"}');
INSERT INTO public.public_profiles (user_id) SELECT id FROM public.users
  WHERE id IN ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002');
INSERT INTO public.boxes (id, user_id, name) VALUES
 ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Private owner box'),
 ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Other box');
INSERT INTO public.items (id, user_id, name, box_id) VALUES
 ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Private item', 'd2000000-0000-4000-8000-000000000001');
INSERT INTO public.photos (id, item_id, url, storage_path) VALUES
 ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
  'https://example.test/storage/v1/object/public/item-photos/d1000000-0000-4000-8000-000000000001/items/a.jpg',
  'd1000000-0000-4000-8000-000000000001/items/a.jpg');
UPDATE public.users SET avatar_url = 'https://example.test/storage/v1/object/public/avatars/d1000000-0000-4000-8000-000000000001/avatar.jpg'
 WHERE id = 'd1000000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := 'd1000000-0000-4000-8000-000000000001';
  other uuid := 'd1000000-0000-4000-8000-000000000002';
  photo uuid := 'd4000000-0000-4000-8000-000000000001';
  result jsonb;
BEGIN
  result := public.media_authorize_reference('photo', photo, actor);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'public authorize hides private collection even from owner');
  result := public.media_authorize_owner_reference('photo', photo, NULL);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'authentication_required', 'owner authorize requires actor');
  result := public.media_authorize_owner_reference('photo', photo, other);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'other actor cannot owner-authorize');
  result := public.media_register_legacy_photo_for_owner(other, photo);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'other actor cannot register');
  PERFORM pg_temp.assert_true((SELECT asset_id IS NULL FROM public.photos WHERE id = photo), 'failed register does not attach');
  result := public.media_register_legacy_photo_for_owner(actor, photo);
  PERFORM pg_temp.assert_true(result->>'ok' = 'true', 'owner can register private photo');
  result := public.media_authorize_owner_reference('photo', photo, actor);
  PERFORM pg_temp.assert_true(result->'data'->>'kind' = 'uploaded', 'owner can sign private collection photo');
  result := public.media_authorize_reference('photo', photo, NULL);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'guest still denied after owner register');
  result := public.media_register_legacy_avatar(actor);
  PERFORM pg_temp.assert_true(result->>'ok' = 'true', 'owner avatar registers');
  result := public.media_authorize_owner_reference('avatar', actor, actor);
  PERFORM pg_temp.assert_true(result->'data'->>'bucket' = 'avatars', 'owner avatar signs');
  result := public.media_authorize_owner_reference('avatar', actor, other);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'other cannot sign owner avatar');
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.media_authorize_owner_reference('photo', 'd4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'client forged owner media';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
