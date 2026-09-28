BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF;
END $$;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('11000000-0000-4000-8000-000000000001','social-a@test.invalid','{"username":"social-a"}'),
 ('11000000-0000-4000-8000-000000000002','social-b@test.invalid','{"username":"social-b"}');

SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid := '11000000-0000-4000-8000-000000000001'; b uuid := '11000000-0000-4000-8000-000000000002'; result jsonb; request_id uuid; stale_id uuid;
BEGIN
  result := public.social_mutate(a,b,'send_request');
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'send request');
  SELECT f.request_id INTO request_id FROM public.social_friendships f WHERE user_low = a AND user_high = b;
  PERFORM public.social_mutate(a,b,'send_request');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.social_notifications WHERE kind = 'request'), 'retry deduplicates notification');
  PERFORM pg_temp.assert_true((SELECT count = 1 FROM sharing_private.social_rate_limits WHERE actor_id = a AND scope = 'minute'), 'retry does not consume rate budget');
  PERFORM public.social_mutate(b,a,'send_request');
  PERFORM pg_temp.assert_true((SELECT status = 'pending' FROM public.social_friendships WHERE user_low = a AND user_high = b), 'opposite request does not accept');
  result := public.social_mutate(a,b,'accept',request_id,1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'stale_request', 'sender cannot accept');
  result := public.social_mutate(b,a,'accept',gen_random_uuid(),1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'stale_request', 'wrong request rejected');
  result := public.social_mutate(b,a,'accept',request_id,1);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'recipient accepts');
  PERFORM pg_temp.assert_true(sharing_private.pair_is_friends(a,b), 'accepted predicate');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.social_notifications WHERE recipient_id = a AND kind = 'acceptance'), 'one acceptance event');
  result := public.social_mutate(b,a,'accept',request_id,1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'stale_request', 'repeat accept stale');
  result := public.social_mutate(a,b,'block');
  PERFORM pg_temp.assert_true((result->>'ok')::boolean AND NOT sharing_private.pair_is_friends(a,b), 'block removes friendship');
  PERFORM pg_temp.assert_true((SELECT bool_and(resolved_at IS NOT NULL) FROM public.social_notifications), 'block resolves pair notifications');
  PERFORM public.social_mutate(b,a,'block');
  PERFORM public.social_mutate(a,b,'unblock');
  PERFORM pg_temp.assert_true(sharing_private.pair_is_blocked(a,b), 'one unblock preserves reverse block');
  PERFORM public.social_mutate(b,a,'unblock');
  PERFORM pg_temp.assert_true(NOT sharing_private.pair_is_blocked(a,b) AND NOT sharing_private.pair_is_friends(a,b), 'unblock restores no friendship');
  PERFORM public.social_mutate(a,b,'send_request');
  stale_id := request_id;
  SELECT f.request_id INTO request_id FROM public.social_friendships f WHERE user_low = a AND user_high = b;
  PERFORM pg_temp.assert_true(request_id <> stale_id, 'new cycle gets new ID');
  result := public.social_mutate(b,a,'accept',stale_id,1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'stale_request', 'old cycle cannot accept new request');
  result := public.social_mutate(b,a,'decline',request_id,1);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'decline');
  result := public.social_mutate(a,b,'send_request');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'rate_limited' AND (result->'error'->>'retryAfterSeconds')::integer > 0, 'decline cooldown');
  result := public.social_mutate(b,a,'send_request');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'rate_limited', 'opposite cooldown');
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.social_mutate('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','send_request');
    RAISE EXCEPTION 'client forged service actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
