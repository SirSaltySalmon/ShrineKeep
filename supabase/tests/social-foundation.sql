-- Run after schema.sql + additive migration, using psql ON_ERROR_STOP=1.
-- Assertions execute against PostgreSQL grants/RLS/constraints, not mocked clients.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001', 'owner@test.invalid', '{"username":"fixture-owner","name":"PRIVATE PROVIDER NAME"}'),
 ('10000000-0000-4000-8000-000000000002', 'friend@test.invalid', '{"username":"fixture-friend"}'),
 ('10000000-0000-4000-8000-000000000003', 'stranger@test.invalid', '{"username":"fixture-stranger"}'),
 ('10000000-0000-4000-8000-000000000004', 'blocked@test.invalid', '{"username":"fixture-blocked"}');

INSERT INTO public.public_profiles (user_id) SELECT id FROM public.users;
SELECT pg_temp.assert_true((SELECT bool_and(nickname IS NULL AND bio = '') FROM public.public_profiles), 'no provider publication');

INSERT INTO public.boxes (id, user_id, name) VALUES
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'private collection');
SELECT pg_temp.assert_true((SELECT collection_visibility = 'private' AND wishlist_visibility = 'private' AND NOT share_financials FROM public.boxes WHERE id = '20000000-0000-4000-8000-000000000001'), 'safe box defaults');

INSERT INTO public.social_friendships (user_low, user_high, requested_by, status, accepted_at) VALUES
 ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'accepted', now());
INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES
 ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001');

DO $$
DECLARE audience public.sharing_audience; viewer uuid; expected boolean; owner_id uuid := '10000000-0000-4000-8000-000000000001';
BEGIN
  FOREACH audience IN ARRAY enum_range(NULL::public.sharing_audience) LOOP
    FOREACH viewer IN ARRAY ARRAY[NULL::uuid, owner_id, '10000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000004'::uuid] LOOP
      expected := coalesce(viewer <> '10000000-0000-4000-8000-000000000004'::uuid, true)
        AND (audience = 'public' OR (audience = 'friends' AND coalesce(viewer IN (owner_id, '10000000-0000-4000-8000-000000000002'::uuid), false)));
      PERFORM pg_temp.assert_true(sharing_private.audience_allows(audience, viewer, owner_id) = expected, 'audience viewer matrix');
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.items (id, user_id, name, is_wishlist, wishlist_target_box_id, expected_price) VALUES
 ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'wishlist', true, '20000000-0000-4000-8000-000000000001', 0);
DO $$
DECLARE collection public.sharing_audience; wishlist public.sharing_audience; explicit_private boolean;
BEGIN
  FOREACH collection IN ARRAY enum_range(NULL::public.sharing_audience) LOOP
    FOREACH wishlist IN ARRAY enum_range(NULL::public.sharing_audience) LOOP
      FOREACH explicit_private IN ARRAY ARRAY[false, true] LOOP
        UPDATE public.boxes SET collection_visibility = collection, wishlist_visibility = wishlist;
        UPDATE public.items SET wishlist_is_private = explicit_private;
        PERFORM pg_temp.assert_true(sharing_private.wishlist_item_is_visible('30000000-0000-4000-8000-000000000001', NULL) = (wishlist = 'public' AND NOT explicit_private), 'independent wishlist guest matrix');
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Both directions block; guest remains intentionally public.
SELECT pg_temp.assert_true(sharing_private.pair_is_blocked('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004'), 'reverse block');
SELECT pg_temp.assert_true(NOT sharing_private.pair_is_blocked(NULL,'10000000-0000-4000-8000-000000000001'), 'guest block semantics');

UPDATE public.users SET public_access_disabled_at = now() WHERE id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT sharing_private.audience_allows('public',NULL,'10000000-0000-4000-8000-000000000001'), 'disabled account denies');
UPDATE public.users SET public_access_disabled_at = NULL WHERE id = '10000000-0000-4000-8000-000000000001';

-- An actual service context executes the same predicates, including root fallback.
SET LOCAL ROLE service_role;
UPDATE public.boxes SET wishlist_visibility = 'private';
UPDATE public.items SET wishlist_is_private = false, wishlist_target_box_id = NULL, wishlist_detached_visibility = 'private';
-- Clearing an explicit veto is a separate owner choice from structural moves.
UPDATE public.items SET wishlist_is_private = false;
UPDATE public.user_settings SET root_wishlist_visibility = 'public';
SELECT pg_temp.assert_true(NOT sharing_private.wishlist_item_is_visible('30000000-0000-4000-8000-000000000001',NULL), 'detached private vetoes root default');
UPDATE public.items SET wishlist_detached_visibility = NULL;
SELECT pg_temp.assert_true(sharing_private.wishlist_item_is_visible('30000000-0000-4000-8000-000000000001',NULL), 'root public fallback');
-- The existing sandbox trigger requires its service claim when setting flags.
SET LOCAL request.jwt.claim.role = 'service_role';
UPDATE public.users SET is_sandbox = true WHERE id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT sharing_private.wishlist_item_is_visible('30000000-0000-4000-8000-000000000001',NULL), 'sandbox denies publication');
UPDATE public.users SET is_sandbox = false WHERE id = '10000000-0000-4000-8000-000000000001';
RESET ROLE;

DO $$
DECLARE tab text; role_name text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['public_profiles','social_friendships','user_blocks','social_notifications'] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name, 'public.' || tab, 'SELECT,INSERT,UPDATE,DELETE'), 'no direct grants: ' || tab || ' ' || role_name);
    END LOOP;
    PERFORM pg_temp.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tab)::regclass), 'RLS enabled: ' || tab);
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role = 'authenticated';
UPDATE public.users SET name = 'Private edit still works' WHERE id = auth.uid();
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.public_profiles;
    RAISE EXCEPTION 'raw profile read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.users SET public_access_disabled_at = now() WHERE id = auth.uid();
    RAISE EXCEPTION 'client changed publication flag';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.users SET sharing_revision = 90 WHERE id = auth.uid();
    RAISE EXCEPTION 'client revision update succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM sharing_private.audience_allows('public',NULL,auth.uid());
    RAISE EXCEPTION 'client predicate call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$ BEGIN
  BEGIN
    INSERT INTO public.social_friendships (user_low,user_high,requested_by,status)
      VALUES ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','pending');
    RAISE EXCEPTION 'noncanonical pair accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.social_friendships (user_low,user_high,requested_by,status)
      VALUES ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','accepted');
    RAISE EXCEPTION 'accepted without timestamp';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
