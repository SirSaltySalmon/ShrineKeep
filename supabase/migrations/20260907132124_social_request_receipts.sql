BEGIN;
CREATE TABLE sharing_private.social_request_receipts (
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,idempotency_key)
);
ALTER TABLE sharing_private.social_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharing_private.social_request_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON sharing_private.social_request_receipts TO service_role;

-- Only successful sends are recorded, including an already-pending pair. A
-- retry after decline/cancel must not create a new request with the same key.
CREATE FUNCTION public.social_send_request(actor_id uuid,target_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE receipt_target uuid; result jsonb;
BEGIN
  IF actor_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401)); END IF;
  IF target_id IS NULL OR idempotency_key IS NULL OR actor_id=target_id THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM sharing_private.lock_accounts(actor_id,target_id);
  IF NOT sharing_private.owner_is_publishable(actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_forbidden','status',403));
  END IF;
  SELECT r.target_id INTO receipt_target FROM sharing_private.social_request_receipts r
    WHERE r.actor_id=social_send_request.actor_id AND r.idempotency_key=social_send_request.idempotency_key;
  IF FOUND THEN
    IF receipt_target<>target_id THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','idempotency_conflict','status',409));
    END IF;
    RETURN jsonb_build_object('ok',true,'data',NULL);
  END IF;
  result := public.social_mutate(actor_id,target_id,'send_request');
  IF result->>'ok'='true' THEN
    INSERT INTO sharing_private.social_request_receipts(actor_id,idempotency_key,target_id)
      VALUES(actor_id,idempotency_key,target_id);
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.social_send_request(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.social_send_request(uuid,uuid,uuid) TO service_role;
COMMIT;
