BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('b1000000-0000-4000-8000-000000000001','style-owner@test.invalid','{"username":"style-owner","name":"SECRET PROVIDER"}'),
 ('b1000000-0000-4000-8000-000000000002','style-blocked@test.invalid','{"username":"style-blocked"}');
INSERT INTO public.public_profiles(user_id) SELECT id FROM public.users
 WHERE id IN ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
UPDATE public.user_settings SET
  wishlist_share_token='SECRET-TOKEN',
  color_scheme='{"background":"0 0% 100%","evil":"url(https://SECRET.invalid)","radius":"9rem"}'::jsonb,
  header_font_family='Lora',
  body_font_family='Geist Mono',
  border_radius='0.75rem',
  graph_overlay=false
 WHERE user_id='b1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $$
DECLARE owner_id uuid := 'b1000000-0000-4000-8000-000000000001';
 blocked_id uuid := 'b1000000-0000-4000-8000-000000000002';
 response jsonb; avatar_id uuid;
BEGIN
 response := public.sharing_read_context(owner_id,NULL);
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'sharedStyle'='null'::jsonb,'opt-in style stays private');
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'avatar'='null'::jsonb AND response->'data'->'profile'->'avatarReferenceId'='null'::jsonb,'no avatar reference');
 PERFORM pg_temp.assert_true(position('SECRET' IN response::text)=0 AND position('wishlist_share_token' IN response::text)=0,'no token or provider name');
 UPDATE public.user_settings SET profile_share_style=true WHERE user_id=owner_id;
 response := public.sharing_read_context(owner_id,NULL);
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'sharedStyle'->>'headerFontFamily'='Lora','shared header font');
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'sharedStyle'->>'borderRadius'='0.75rem','shared radius');
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'sharedStyle'->'colorScheme'->>'background'='0 0% 100%','shared color token');
 PERFORM pg_temp.assert_true(NOT (response->'data'->'profile'->'sharedStyle' ? 'graph_overlay'),'private setting omitted');
 PERFORM pg_temp.assert_true(public.sharing_read_context(owner_id,blocked_id)->'error'->>'code'='not_found','block denies style');
 response := public.media_register_asset(owner_id,'avatars',owner_id::text || '/avatars/v1.png','image/png',12,'ready');
 PERFORM pg_temp.assert_true((response->>'ok')::boolean,'avatar registered');
 avatar_id := (response->'data'->>'assetId')::uuid;
 PERFORM pg_temp.assert_true((public.media_attach_avatar(owner_id,avatar_id)->>'ok')::boolean,'avatar attached');
 response := public.sharing_read_context(owner_id,NULL);
 PERFORM pg_temp.assert_true(response->'data'->'profile'->>'avatarReferenceId'=owner_id::text,'avatar reference is owner id');
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'avatar'='null'::jsonb,'sql never signs avatar');
 UPDATE public.media_assets SET state='pending' WHERE id=avatar_id;
 response := public.sharing_read_context(owner_id,NULL);
 PERFORM pg_temp.assert_true(response->'data'->'profile'->'avatarReferenceId'='null'::jsonb,'pending avatar omitted');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.sharing_read_context('b1000000-0000-4000-8000-000000000001',NULL);
  RAISE EXCEPTION 'client bypassed profile context';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
