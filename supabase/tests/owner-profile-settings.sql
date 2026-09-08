BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f1000000-0000-4000-8000-000000000001','owner-settings@test.invalid','{"username":"owner-settings"}'),
 ('f1000000-0000-4000-8000-000000000002','settings-other@test.invalid','{"username":"settings-other"}');

UPDATE public.user_settings SET
  wishlist_share_token='f4000000-0000-4000-8000-000000000001',
  wishlist_link_enabled=true,
  root_collection_visibility='private',
  root_wishlist_visibility='public'
 WHERE user_id='f1000000-0000-4000-8000-000000000001';

INSERT INTO public.boxes(id,user_id,name,collection_visibility,wishlist_visibility) VALUES
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','top', 'private','public');

INSERT INTO public.items(id,user_id,is_wishlist,wishlist_target_box_id,name,expected_price) VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',true,NULL,'loose public wish',1),
 ('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001',true,NULL,'second loose wish',2),
 ('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001',true,'f2000000-0000-4000-8000-000000000001','boxed public wish',3);

SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := 'f1000000-0000-4000-8000-000000000001';
  token text := 'f4000000-0000-4000-8000-000000000001';
  read jsonb; written jsonb; resolved jsonb; page jsonb; rev bigint;
BEGIN
  read := public.sharing_read_owner_settings(actor);
  PERFORM pg_temp.assert_true((read->>'ok')::boolean, 'owner settings readable');
  PERFORM pg_temp.assert_true(read->'data'->>'nickname' IS NULL, 'unset nickname is null');
  PERFORM pg_temp.assert_true((read->'data'->>'wishlistGuestVisibleCount')::bigint=3, 'guest-visible count');
  PERFORM pg_temp.assert_true((read->'data'->>'wishlistGuestTotalCount')::bigint=3, 'guest-total count');
  rev := (read->'data'->>'revision')::bigint;

  written := public.sharing_update_owner_settings(
    actor, '  Displayed  ', 'plain bio', true,
    'private', false, 'public', true, NULL, rev);
  PERFORM pg_temp.assert_true((written->>'ok')::boolean, 'owner settings save');
  PERFORM pg_temp.assert_true(
    (SELECT nickname FROM public.public_profiles WHERE user_id=actor)='Displayed',
    'nickname trimmed and stored');
  PERFORM pg_temp.assert_true(
    (SELECT bio FROM public.public_profiles WHERE user_id=actor)='plain bio',
    'bio stored as plain text');
  PERFORM pg_temp.assert_true(
    (SELECT profile_share_style FROM public.user_settings WHERE user_id=actor),
    'profile style saved');

  resolved := public.sharing_resolve_wishlist_token(token, NULL);
  PERFORM pg_temp.assert_true(resolved->'data'->>'ownerId'=actor::text, 'link on resolves');

  rev := (written->'data'->>'revision')::bigint;
  written := public.sharing_update_owner_settings(
    actor, 'Displayed', 'plain bio', true,
    'private', false, 'public', false, NULL, rev);
  PERFORM pg_temp.assert_true((written->>'ok')::boolean, 'link off save');
  PERFORM pg_temp.assert_true(
    public.sharing_resolve_wishlist_token(token, NULL)->'error'->>'code'='not_found',
    'link off 404s token');
  PERFORM pg_temp.assert_true(
    (SELECT wishlist_share_token FROM public.user_settings WHERE user_id=actor)=token,
    'disabling the link keeps the token');
  page := public.sharing_read_page(actor, NULL, 'wishlist');
  PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows')=3,
    'profile wishlist still lists public root and box entries when the link is off');
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM jsonb_array_elements(page->'data'->'rows') r WHERE r->'item'->>'name'='loose public wish'),
    'private collection root with public root wishlist publishes loose wishes');

  rev := (written->'data'->>'revision')::bigint;
  PERFORM pg_temp.assert_true((written->'data'->>'wishlistGuestVisibleCount')::bigint=3,
    'update returns visible count');
  written := public.sharing_update_owner_settings(
    actor, 'Displayed', 'plain bio', true,
    'private', false, 'private', false, NULL, rev);
  PERFORM pg_temp.assert_true((written->>'ok')::boolean, 'narrow root wishlist');
  PERFORM pg_temp.assert_true((written->'data'->>'wishlistGuestVisibleCount')::bigint=0,
    'narrowing root wishlist hides previously visible wishes');
  page := public.sharing_read_page(actor, NULL, 'wishlist');
  PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows')=0,
    'ceiling makes a public box wishlist unrepresentable under a private root wishlist');

  PERFORM pg_temp.assert_true(
    public.sharing_update_owner_settings(
      actor, 'Displayed', 'plain bio', true,
      'private', false, 'public', false, NULL, 1)->'error'->>'code'='revision_conflict',
    'stale revision rejected');

  PERFORM pg_temp.assert_true(
    public.sharing_update_owner_settings(
      actor, '😀' || repeat('x', 64), 'plain bio', false,
      'private', false, 'private', false, NULL, (SELECT sharing_revision FROM public.users WHERE id=actor)
    )->'error'->>'code'='invalid_input',
    'overlong nickname rejected');

  PERFORM pg_temp.assert_true(
    public.sharing_update_owner_settings(
      actor, 'Displayed', repeat('b', 501), false,
      'private', false, 'private', false, NULL, (SELECT sharing_revision FROM public.users WHERE id=actor)
    )->'error'->>'code'='invalid_input',
    'overlong bio rejected');

  PERFORM pg_temp.assert_true(
    public.sharing_read_context(actor, NULL)->'data'->'profile'->>'nickname'='Displayed',
    'public profile read uses saved nickname');
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.sharing_update_owner_settings(
      'f1000000-0000-4000-8000-000000000001', NULL, '', false,
      'private', false, 'private', false, NULL, 0);
    RAISE EXCEPTION 'client bypassed owner settings writer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
