BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT
 ('d1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'receipt-'||n||'@test.invalid',jsonb_build_object('username','receipt-'||n)
 FROM generate_series(1,3) n;
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.social_send_request(uuid,uuid,uuid)','EXECUTE'),'send RPC is service-only');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','sharing_private.social_request_receipts','SELECT'),'receipts private');
SET LOCAL ROLE service_role;
DO $$ DECLARE
 actor uuid := 'd1000000-0000-4000-8000-000000000001';
 target uuid := 'd1000000-0000-4000-8000-000000000002';
 other_id uuid := 'd1000000-0000-4000-8000-000000000003';
 key_id uuid := 'd2000000-0000-4000-8000-000000000001';
 request_id uuid; result jsonb; before_revision bigint;
BEGIN
 result := public.social_send_request(actor,target,key_id);
 PERFORM pg_temp.assert_true(result->>'ok'='true','send succeeds');
 SELECT sharing_revision INTO before_revision FROM public.users WHERE id=actor;
 result := public.social_send_request(actor,target,key_id);
 PERFORM pg_temp.assert_true(result->>'ok'='true','retry succeeds');
 PERFORM pg_temp.assert_true((SELECT sharing_revision=before_revision FROM public.users WHERE id=actor),'retry does not mutate');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.social_notifications WHERE recipient_id=target),'one notification');
 result := public.social_send_request(actor,other_id,key_id);
 PERFORM pg_temp.assert_true(result->'error'->>'code'='idempotency_conflict','same key different target conflicts');
 SELECT f.request_id INTO request_id FROM public.social_friendships f WHERE user_low=actor AND user_high=target;
 result := public.social_mutate(actor,target,'cancel',request_id,1);
 PERFORM pg_temp.assert_true(result->>'ok'='true','cancel succeeds');
 result := public.social_send_request(actor,target,key_id);
 PERFORM pg_temp.assert_true(result->>'ok'='true','old retry acknowledged after cancellation');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.social_friendships WHERE user_low=actor AND user_high=target),'retry does not recreate request');
 result := public.social_send_request(actor,target,'d2000000-0000-4000-8000-000000000002');
 PERFORM pg_temp.assert_true(result->'error'->>'code'='rate_limited','new key still respects cooldown');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM sharing_private.social_request_receipts WHERE actor_id=actor),'failed request not recorded');
 UPDATE public.users SET public_access_disabled_at=now() WHERE id=actor;
 result := public.social_send_request(actor,target,key_id);
 PERFORM pg_temp.assert_true(result->'error'->>'code'='mutation_forbidden','disabled actor cannot replay');
END $$;
ROLLBACK;
