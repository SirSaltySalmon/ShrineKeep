BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('a1000000-0000-4000-8000-000000000001','box-invariants@test.invalid','{"username":"box-invariants"}'),
 ('a1000000-0000-4000-8000-000000000002','box-invariants-other@test.invalid','{"username":"box-invariants-other"}');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
INSERT INTO public.boxes(id,user_id,name,collection_visibility,share_financials,wishlist_visibility) VALUES
 ('a2000000-0000-4000-8000-000000000001',auth.uid(),'Root','public',true,'public');
SELECT pg_temp.assert_true((SELECT collection_visibility = 'private' AND NOT share_financials AND wishlist_visibility = 'private' FROM public.boxes WHERE id='a2000000-0000-4000-8000-000000000001'),'root always private');
UPDATE public.boxes SET collection_visibility='public',share_financials=true,wishlist_visibility='friends' WHERE id='a2000000-0000-4000-8000-000000000001';
INSERT INTO public.boxes(id,user_id,parent_box_id,name) VALUES
 ('a2000000-0000-4000-8000-000000000002',auth.uid(),'a2000000-0000-4000-8000-000000000001','Child');
SELECT pg_temp.assert_true((SELECT collection_visibility = 'public' AND share_financials AND wishlist_visibility = 'friends' FROM public.boxes WHERE id='a2000000-0000-4000-8000-000000000002'),'child inherits all fields');
UPDATE public.boxes SET parent_box_id=NULL WHERE id='a2000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT collection_visibility = 'public' AND share_financials AND wishlist_visibility = 'friends' FROM public.boxes WHERE id='a2000000-0000-4000-8000-000000000002'),'move preserves settings');
DO $$ DECLARE before_revision bigint; after_revision bigint;
BEGIN
  SELECT sharing_revision INTO before_revision FROM public.users WHERE id=auth.uid();
  INSERT INTO public.boxes(user_id,name) SELECT auth.uid(),'Batch ' || n FROM generate_series(1,30) n;
  SELECT sharing_revision INTO after_revision FROM public.users WHERE id=auth.uid();
  PERFORM pg_temp.assert_true(after_revision=before_revision+1,'batch increments once, not once per row');
  BEGIN
    UPDATE public.boxes SET parent_box_id=id WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'self-parent allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.boxes SET parent_box_id=CASE id WHEN 'a2000000-0000-4000-8000-000000000001'::uuid THEN 'a2000000-0000-4000-8000-000000000002'::uuid ELSE 'a2000000-0000-4000-8000-000000000001'::uuid END
      WHERE id IN ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'multi-row cycle allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.assert_true((SELECT bool_and(parent_box_id IS NULL) FROM public.boxes WHERE id IN ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')),'failed cycle update rolls back all rows');
  BEGIN
    UPDATE public.boxes SET user_id='a1000000-0000-4000-8000-000000000002' WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ownership transfer allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.boxes(id,user_id,name) VALUES ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','Other parent');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE public.boxes SET parent_box_id='a2000000-0000-4000-8000-000000000003' WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cross-owner parent allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
UPDATE public.users SET is_sandbox=true WHERE id='a1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
UPDATE public.boxes SET collection_visibility='private',wishlist_visibility='private' WHERE id='a2000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    UPDATE public.boxes SET wishlist_visibility='public' WHERE id='a2000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'sandbox publication allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
