BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('81000000-0000-4000-8000-000000000001','gc-worker@test.invalid','{}');
SET LOCAL ROLE service_role;
DO $$
#variable_conflict use_variable
DECLARE
 owner_id uuid := '81000000-0000-4000-8000-000000000001';
 asset_id uuid; response jsonb; first_token uuid; second_token uuid;
BEGIN
 response := public.media_register_asset(owner_id,'item-photos',owner_id::text || '/items/gc.jpg','image/jpeg',12,'ready');
 asset_id := (response->'data'->>'assetId')::uuid;
 INSERT INTO public.media_gc_queue(asset_id) VALUES(asset_id);
 response := public.media_claim_gc(1);
 first_token := (response->'data'->'assets'->0->>'claimToken')::uuid;
 PERFORM pg_temp.assert_true(first_token IS NOT NULL,'claim has token');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.media_claim_gc(1)->'data'->'assets')=0,'active lease skips duplicate worker');
 PERFORM pg_temp.assert_true(public.media_complete_gc(asset_id,gen_random_uuid(),true)->'error'->>'code'='conflict','forged completion denied');
 UPDATE public.media_gc_queue SET claim_expires_at=now()-interval '1 second' WHERE media_gc_queue.asset_id=asset_id;
 response := public.media_claim_gc(1);
 second_token := (response->'data'->'assets'->0->>'claimToken')::uuid;
 PERFORM pg_temp.assert_true(second_token <> first_token,'crashed claim reclaimed with new fence');
 PERFORM pg_temp.assert_true(public.media_complete_gc(asset_id,first_token,true)->'error'->>'code'='conflict','stale worker cannot complete new claim');
 PERFORM pg_temp.assert_true(public.media_complete_gc(asset_id,second_token,false)->'data'->>'state'='retry','storage failure recorded');
 PERFORM pg_temp.assert_true((SELECT next_attempt_at > now() AND last_error='storage_delete_failed' FROM public.media_gc_queue q WHERE q.asset_id=asset_id),'retry is delayed and sanitized');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.media_claim_gc(1)->'data'->'assets')=0,'backoff respected');
 UPDATE public.media_gc_queue SET next_attempt_at=now() WHERE media_gc_queue.asset_id=asset_id;
 response := public.media_claim_gc(1);
 second_token := (response->'data'->'assets'->0->>'claimToken')::uuid;
 PERFORM pg_temp.assert_true(public.media_complete_gc(asset_id,second_token,true)->'data'->>'state'='deleted','successful retry tombstones');
 BEGIN
   PERFORM public.media_finalize_gc(asset_id);
   RAISE EXCEPTION 'unfenced finalizer still callable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Deleting the account must not cascade away the only object cleanup identity.
INSERT INTO public.media_assets(owner_id,bucket,object_path,mime,byte_size,state,created_at)
 VALUES('81000000-0000-4000-8000-000000000001','avatars','81000000-0000-4000-8000-000000000001/avatar.jpg','image/jpeg',12,'pending',now()-interval '2 hours');
DELETE FROM auth.users WHERE id='81000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.media_assets WHERE object_path='81000000-0000-4000-8000-000000000001/avatar.jpg'),'manifest survives account deletion');
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(jsonb_array_length(public.media_claim_gc(1)->'data'->'assets')=1,'deleted-account pending asset swept');
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.media_claim_gc(1);
  RAISE EXCEPTION 'client claimed GC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.media_complete_gc(gen_random_uuid(),gen_random_uuid(),true);
  RAISE EXCEPTION 'client completed GC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
