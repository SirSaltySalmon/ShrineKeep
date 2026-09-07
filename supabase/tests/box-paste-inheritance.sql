BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('e1000000-0000-4000-8000-000000000001', 'paste-inherit@test.invalid', '{"username":"paste-inherit"}');
INSERT INTO public.boxes (id, user_id, name) VALUES
 ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Published parent');
UPDATE public.boxes
  SET collection_visibility = 'friends', share_financials = true, wishlist_visibility = 'public'
 WHERE id = 'e2000000-0000-4000-8000-000000000001';

SELECT public.paste_box_trees_atomic(
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  50,
  '[{"temp_id":"e2100000-0000-4000-8000-000000000001","parent_temp_id":null,"name":"Pasted child","description":null,"position":0}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
);

SELECT pg_temp.assert_true((
  SELECT collection_visibility = 'friends' AND share_financials AND wishlist_visibility = 'public'
  FROM public.boxes
  WHERE user_id = 'e1000000-0000-4000-8000-000000000001'
    AND parent_box_id = 'e2000000-0000-4000-8000-000000000001'
    AND name = 'Pasted child'
), 'paste into published parent inherits all three fields');
ROLLBACK;
