BEGIN;
CREATE OR REPLACE FUNCTION public.sharing_resolve_wishlist_token(p_token text, p_viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE owner_id uuid; context jsonb;
BEGIN
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 8 AND 128 OR p_token !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  SELECT s.user_id INTO owner_id FROM public.user_settings s WHERE s.wishlist_share_token = p_token;
  IF owner_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  context := public.sharing_read_context(owner_id, p_viewer_id);
  IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('ownerId',owner_id));
END $$;
REVOKE ALL ON FUNCTION public.sharing_resolve_wishlist_token(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_resolve_wishlist_token(text,uuid) TO service_role;
COMMIT;
