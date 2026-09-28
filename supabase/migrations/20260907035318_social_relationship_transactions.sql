-- T03 service-only mutations. Requires 20260907034821. Feature remains disabled.
BEGIN;

-- All hierarchy/privacy/media/copy writers must reuse these account locks.
-- UUID ordering is shared with relationship finalization to avoid lock inversion.
CREATE FUNCTION sharing_private.lock_accounts(first_id uuid, second_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE account_id uuid;
BEGIN
  FOR account_id IN SELECT DISTINCT id FROM unnest(ARRAY[first_id, second_id]) ids(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('sharing-account:' || account_id::text, 0));
  END LOOP;
END $$;

CREATE FUNCTION public.social_mutate(
  actor_id uuid, target_id uuid, operation text,
  expected_request_id uuid DEFAULT NULL, expected_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  low_id uuid := least(actor_id, target_id);
  high_id uuid := greatest(actor_id, target_id);
  pair public.social_friendships%ROWTYPE;
  event_id uuid;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  minute_count integer;
  day_count integer;
  cooldown timestamptz;
BEGIN
  IF actor_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401)); END IF;
  IF target_id IS NULL OR actor_id = target_id OR operation IS NULL OR operation NOT IN ('send_request','accept','decline','cancel','unfriend','block','unblock') THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM sharing_private.lock_accounts(actor_id, target_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('sharing-pair:' || low_id::text || ':' || high_id::text, 0));
  IF NOT sharing_private.owner_is_publishable(actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_forbidden','status',403));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;

  SELECT * INTO pair FROM public.social_friendships WHERE user_low = low_id AND user_high = high_id FOR UPDATE;
  IF operation = 'block' THEN
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (actor_id, target_id) ON CONFLICT DO NOTHING;
    DELETE FROM public.social_friendships WHERE user_low = low_id AND user_high = high_id;
    -- Suppress both directions without exposing stored actor snapshots.
    UPDATE public.social_notifications n SET resolved_at = coalesce(n.resolved_at,now())
      WHERE (n.recipient_id = actor_id AND n.actor_id = target_id) OR (n.recipient_id = target_id AND n.actor_id = actor_id);
  ELSIF operation = 'unblock' THEN
    DELETE FROM public.user_blocks WHERE blocker_id = actor_id AND blocked_id = target_id;
  ELSE
    IF NOT sharing_private.owner_is_publishable(target_id) OR sharing_private.pair_is_blocked(actor_id,target_id) THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
    END IF;
    IF operation = 'send_request' THEN
      -- Includes opposite-direction pending: return current state, never auto-accept.
      IF pair.user_low IS NOT NULL THEN
        RETURN jsonb_build_object('ok',true,'data',NULL);
      END IF;
      SELECT max(expires_at) INTO cooldown FROM sharing_private.social_rate_limits
        WHERE social_rate_limits.actor_id = social_mutate.actor_id AND scope = 'pair:' || target_id::text AND expires_at > now();
      SELECT coalesce(max(count),0) INTO minute_count FROM sharing_private.social_rate_limits
        WHERE social_rate_limits.actor_id = social_mutate.actor_id AND scope = 'minute' AND window_start = minute_start;
      SELECT coalesce(max(count),0) INTO day_count FROM sharing_private.social_rate_limits
        WHERE social_rate_limits.actor_id = social_mutate.actor_id AND scope = 'day' AND window_start = day_start;
      IF cooldown IS NOT NULL OR minute_count >= 10 OR day_count >= 50 THEN
        RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','rate_limited','status',429,'retryAfterSeconds',greatest(1,ceil(extract(epoch FROM (greatest(coalesce(cooldown,now()),CASE WHEN minute_count >= 10 THEN minute_start + interval '1 minute' ELSE now() END,CASE WHEN day_count >= 50 THEN day_start + interval '1 day' ELSE now() END) - now()))))));
      END IF;
      INSERT INTO public.social_friendships (user_low,user_high,requested_by,status)
        VALUES (low_id,high_id,actor_id,'pending') RETURNING request_id INTO event_id;
      INSERT INTO public.social_notifications (recipient_id,actor_id,kind,event_id) VALUES (target_id,actor_id,'request',event_id);
      INSERT INTO sharing_private.social_rate_limits (actor_id,scope,window_start,count,expires_at)
        VALUES (actor_id,'minute',minute_start,1,minute_start + interval '1 minute'), (actor_id,'day',day_start,1,day_start + interval '1 day')
        ON CONFLICT ON CONSTRAINT social_rate_limits_pkey DO UPDATE SET count = sharing_private.social_rate_limits.count + 1;
    ELSIF operation IN ('accept','decline','cancel') THEN
      IF pair.user_low IS NULL OR pair.status <> 'pending' OR expected_request_id IS DISTINCT FROM pair.request_id OR expected_version IS DISTINCT FROM pair.version OR
        (operation IN ('accept','decline') AND pair.requested_by = actor_id) OR (operation = 'cancel' AND pair.requested_by <> actor_id) THEN
        RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','stale_request','status',409));
      END IF;
      UPDATE public.social_notifications n SET resolved_at = coalesce(n.resolved_at,now()) WHERE n.event_id = pair.request_id AND n.kind = 'request';
      IF operation = 'accept' THEN
        UPDATE public.social_friendships SET status = 'accepted', accepted_at = now(), version = version + 1 WHERE user_low = low_id AND user_high = high_id;
        INSERT INTO public.social_notifications (recipient_id,actor_id,kind,event_id) VALUES (pair.requested_by,actor_id,'acceptance',pair.request_id) ON CONFLICT DO NOTHING;
      ELSE
        DELETE FROM public.social_friendships WHERE user_low = low_id AND user_high = high_id;
      END IF;
    ELSIF operation = 'unfriend' THEN
      IF pair.user_low IS NULL OR pair.status <> 'accepted' THEN
        RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','stale_request','status',409));
      END IF;
      DELETE FROM public.social_friendships WHERE user_low = low_id AND user_high = high_id;
    END IF;
  END IF;
  IF operation IN ('decline','cancel','unfriend') THEN
    -- Both endpoints receive a cooldown; opposite requests cannot bypass it.
    INSERT INTO sharing_private.social_rate_limits (actor_id,scope,window_start,count,expires_at)
      VALUES (actor_id,'pair:' || target_id::text,day_start,1,now() + interval '24 hours'),
             (target_id,'pair:' || actor_id::text,day_start,1,now() + interval '24 hours')
      ON CONFLICT ON CONSTRAINT social_rate_limits_pkey DO UPDATE SET expires_at = excluded.expires_at;
  END IF;
  UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id IN (actor_id,target_id);
  RETURN jsonb_build_object('ok',true,'data',NULL);
END $$;

REVOKE ALL ON FUNCTION sharing_private.lock_accounts(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.lock_accounts(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.social_mutate(uuid,uuid,text,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_mutate(uuid,uuid,text,uuid,bigint) TO service_role;
COMMIT;
