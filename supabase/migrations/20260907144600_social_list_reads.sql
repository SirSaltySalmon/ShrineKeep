-- T03 actor-scoped list reads, mark-read, retention, and mutation revision payloads.
-- Service-only. Inbox routes stay disabled until the coordinated privacy cutover.
BEGIN;

CREATE FUNCTION sharing_private.revision_payload(p_actor_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('revision',u.sharing_revision::text) FROM public.users u WHERE u.id = p_actor_id;
$$;

CREATE FUNCTION sharing_private.public_identity(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id',p_user_id,
    'nickname',coalesce(nullif(btrim(p.nickname),''),'Collector-' || right(p_user_id::text,8)),
    'avatar',NULL)
  FROM (SELECT nickname FROM public.public_profiles WHERE user_id = p_user_id) p
  UNION ALL
  SELECT jsonb_build_object('id',p_user_id,'nickname','Collector-' || right(p_user_id::text,8),'avatar',NULL)
  WHERE NOT EXISTS (SELECT 1 FROM public.public_profiles WHERE user_id = p_user_id)
  LIMIT 1;
$$;

CREATE FUNCTION sharing_private.display_nickname(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(p.nickname),''),'Collector-' || right(p_user_id::text,8))
  FROM (SELECT nickname FROM public.public_profiles WHERE user_id = p_user_id) p
  UNION ALL
  SELECT 'Collector-' || right(p_user_id::text,8)
  WHERE NOT EXISTS (SELECT 1 FROM public.public_profiles WHERE user_id = p_user_id)
  LIMIT 1;
$$;

CREATE FUNCTION sharing_private.like_contains(p_query text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '%' || replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_') || '%';
$$;

CREATE OR REPLACE FUNCTION public.social_mutate(
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
    UPDATE public.social_notifications n SET resolved_at = coalesce(n.resolved_at,now())
      WHERE (n.recipient_id = actor_id AND n.actor_id = target_id) OR (n.recipient_id = target_id AND n.actor_id = actor_id);
  ELSIF operation = 'unblock' THEN
    DELETE FROM public.user_blocks WHERE blocker_id = actor_id AND blocked_id = target_id;
  ELSE
    IF NOT sharing_private.owner_is_publishable(target_id) OR sharing_private.pair_is_blocked(actor_id,target_id) THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
    END IF;
    IF operation = 'send_request' THEN
      IF pair.user_low IS NOT NULL THEN
        RETURN jsonb_build_object('ok',true,'data',sharing_private.revision_payload(actor_id));
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
    INSERT INTO sharing_private.social_rate_limits (actor_id,scope,window_start,count,expires_at)
      VALUES (actor_id,'pair:' || target_id::text,day_start,1,now() + interval '24 hours'),
             (target_id,'pair:' || actor_id::text,day_start,1,now() + interval '24 hours')
      ON CONFLICT ON CONSTRAINT social_rate_limits_pkey DO UPDATE SET expires_at = excluded.expires_at;
  END IF;
  UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id IN (actor_id,target_id);
  RETURN jsonb_build_object('ok',true,'data',sharing_private.revision_payload(actor_id));
END $$;

CREATE OR REPLACE FUNCTION public.social_send_request(actor_id uuid,target_id uuid,idempotency_key uuid)
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
    RETURN jsonb_build_object('ok',true,'data',sharing_private.revision_payload(actor_id));
  END IF;
  result := public.social_mutate(actor_id,target_id,'send_request');
  IF result->>'ok'='true' THEN
    INSERT INTO sharing_private.social_request_receipts(actor_id,idempotency_key,target_id)
      VALUES(actor_id,idempotency_key,target_id);
  END IF;
  RETURN result;
END $$;

-- Every page reauthorizes against the verified actor. Cursor keys never grant access.
CREATE FUNCTION public.social_read_page(
  p_actor_id uuid, p_surface text, p_direction text DEFAULT NULL,
  p_query text DEFAULT NULL, p_after_key jsonb DEFAULT NULL, p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  revision text;
  rows jsonb := '[]'::jsonb;
  unread integer := 0;
  query_text text := nullif(btrim(coalesce(p_query,'')),'');
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  SELECT u.sharing_revision::text INTO revision FROM public.users u WHERE u.id = p_actor_id;
  IF p_expected_revision IS NOT NULL AND p_expected_revision::text <> revision THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','cursor_reset','status',409));
  END IF;
  IF p_surface IS NULL OR p_surface NOT IN ('friends','requests','notifications','blocks')
    OR (p_surface = 'requests' AND coalesce(p_direction,'') NOT IN ('incoming','outgoing'))
    OR (p_surface <> 'requests' AND p_direction IS NOT NULL)
    OR (p_surface <> 'friends' AND query_text IS NOT NULL)
    OR char_length(coalesce(p_query,'')) > 64 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_after_key IS NOT NULL THEN
    IF jsonb_typeof(p_after_key) <> 'object' OR NOT (p_after_key ? 'id' AND p_after_key ? 'value') OR
      jsonb_typeof(p_after_key->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_after_key->'value') IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    END IF;
    PERFORM (p_after_key->>'id')::uuid;
    PERFORM (p_after_key->>'value')::timestamptz;
  END IF;

  IF p_surface = 'friends' THEN
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.accepted_at DESC,q.friend_id DESC),'[]'::jsonb) INTO rows FROM (
      SELECT fr.friend_id,fr.accepted_at,jsonb_build_object(
        'key',jsonb_build_object('value',fr.accepted_at,'id',fr.friend_id),
        'item',jsonb_build_object('profile',sharing_private.public_identity(fr.friend_id),'acceptedAt',fr.accepted_at)) AS row
      FROM (
        SELECT CASE WHEN f.user_low = p_actor_id THEN f.user_high ELSE f.user_low END AS friend_id, f.accepted_at
        FROM public.social_friendships f
        WHERE f.status = 'accepted' AND (f.user_low = p_actor_id OR f.user_high = p_actor_id)
      ) fr
      WHERE sharing_private.owner_is_publishable(fr.friend_id)
        AND NOT sharing_private.pair_is_blocked(p_actor_id,fr.friend_id)
        AND (query_text IS NULL OR lower(sharing_private.display_nickname(fr.friend_id)) LIKE lower(sharing_private.like_contains(query_text)) ESCAPE '\')
        AND (p_after_key IS NULL OR (fr.accepted_at,fr.friend_id) < ((p_after_key->>'value')::timestamptz,(p_after_key->>'id')::uuid))
      ORDER BY fr.accepted_at DESC, fr.friend_id DESC LIMIT 21
    ) q;
  ELSIF p_surface = 'requests' THEN
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.created_at DESC,q.request_id DESC),'[]'::jsonb) INTO rows FROM (
      SELECT f.request_id,f.created_at,jsonb_build_object(
        'key',jsonb_build_object('value',f.created_at,'id',f.request_id),
        'item',jsonb_build_object(
          'profile',sharing_private.public_identity(CASE WHEN f.user_low = p_actor_id THEN f.user_high ELSE f.user_low END),
          'requestId',f.request_id,'version',f.version::text,'createdAt',f.created_at,'direction',p_direction)) AS row
      FROM public.social_friendships f
      WHERE f.status = 'pending' AND (f.user_low = p_actor_id OR f.user_high = p_actor_id)
        AND sharing_private.owner_is_publishable(CASE WHEN f.user_low = p_actor_id THEN f.user_high ELSE f.user_low END)
        AND NOT sharing_private.pair_is_blocked(p_actor_id, CASE WHEN f.user_low = p_actor_id THEN f.user_high ELSE f.user_low END)
        AND ((p_direction = 'outgoing' AND f.requested_by = p_actor_id) OR (p_direction = 'incoming' AND f.requested_by <> p_actor_id))
        AND (p_after_key IS NULL OR (f.created_at,f.request_id) < ((p_after_key->>'value')::timestamptz,(p_after_key->>'id')::uuid))
      ORDER BY f.created_at DESC, f.request_id DESC LIMIT 21
    ) q;
  ELSIF p_surface = 'notifications' THEN
    SELECT count(*)::integer INTO unread FROM (
      SELECT 1 FROM public.social_notifications n
      WHERE n.recipient_id = p_actor_id AND n.read_at IS NULL AND n.resolved_at IS NULL
        AND sharing_private.owner_is_publishable(n.actor_id)
        AND NOT sharing_private.pair_is_blocked(p_actor_id,n.actor_id)
      LIMIT 101
    ) visible_unread;
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO rows FROM (
      SELECT n.id,n.created_at,jsonb_build_object(
        'key',jsonb_build_object('value',n.created_at,'id',n.id),
        'item',jsonb_build_object(
          'id',n.id,'actor',sharing_private.public_identity(n.actor_id),'kind',n.kind,
          'createdAt',n.created_at,'readAt',n.read_at,
          'actionableRequest',CASE WHEN n.kind = 'request' AND n.resolved_at IS NULL AND f.request_id IS NOT NULL
            THEN jsonb_build_object('requestId',f.request_id,'version',f.version::text) ELSE NULL END)) AS row
      FROM public.social_notifications n
      LEFT JOIN public.social_friendships f ON f.request_id = n.event_id AND f.status = 'pending'
      WHERE n.recipient_id = p_actor_id
        AND sharing_private.owner_is_publishable(n.actor_id)
        AND NOT sharing_private.pair_is_blocked(p_actor_id,n.actor_id)
        AND (p_after_key IS NULL OR (n.created_at,n.id) < ((p_after_key->>'value')::timestamptz,(p_after_key->>'id')::uuid))
      ORDER BY n.created_at DESC, n.id DESC LIMIT 21
    ) q;
  ELSE
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.created_at DESC,q.blocked_id DESC),'[]'::jsonb) INTO rows FROM (
      SELECT b.blocked_id,b.created_at,jsonb_build_object(
        'key',jsonb_build_object('value',b.created_at,'id',b.blocked_id),
        'item',jsonb_build_object('userId',b.blocked_id,'createdAt',b.created_at)) AS row
      FROM public.user_blocks b
      WHERE b.blocker_id = p_actor_id
        AND (p_after_key IS NULL OR (b.created_at,b.blocked_id) < ((p_after_key->>'value')::timestamptz,(p_after_key->>'id')::uuid))
      ORDER BY b.created_at DESC, b.blocked_id DESC LIMIT 21
    ) q;
  END IF;

  IF p_surface = 'notifications' THEN
    RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
      'rows',rows,'revision',revision,'viewerCategory','owner',
      'unreadCount',least(unread,100),'unreadCountCapped',unread > 100));
  END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'revision',revision,'viewerCategory','owner'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;

CREATE FUNCTION public.social_mark_read(p_actor_id uuid, p_notification_ids uuid[] DEFAULT NULL, p_all_visible boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE changed integer := 0;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  IF p_all_visible IS DISTINCT FROM true AND (p_notification_ids IS NULL OR cardinality(p_notification_ids) BETWEEN 1 AND 100) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_all_visible IS TRUE AND p_notification_ids IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_actor_id);
  IF p_all_visible THEN
    UPDATE public.social_notifications n SET read_at = now()
      WHERE n.recipient_id = p_actor_id AND n.read_at IS NULL
        AND sharing_private.owner_is_publishable(n.actor_id)
        AND NOT sharing_private.pair_is_blocked(p_actor_id,n.actor_id);
  ELSE
    UPDATE public.social_notifications n SET read_at = now()
      WHERE n.recipient_id = p_actor_id AND n.read_at IS NULL AND n.id = ANY(p_notification_ids);
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed > 0 THEN
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = p_actor_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'data',sharing_private.revision_payload(p_actor_id));
END $$;

-- Pending unresolved request notifications are retained even when old.
CREATE FUNCTION public.social_retain_history(p_retention interval DEFAULT interval '90 days')
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE removed integer := 0;
BEGIN
  IF p_retention IS NULL OR p_retention < interval '0' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  DELETE FROM public.social_notifications n
    WHERE n.created_at < now() - p_retention
      AND (n.resolved_at IS NOT NULL OR (n.kind = 'acceptance' AND n.read_at IS NOT NULL));
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM sharing_private.social_rate_limits WHERE expires_at < now();
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('removedNotifications',removed));
END $$;

REVOKE ALL ON FUNCTION sharing_private.revision_payload(uuid), sharing_private.public_identity(uuid),
  sharing_private.display_nickname(uuid), sharing_private.like_contains(text),
  public.social_read_page(uuid,text,text,text,jsonb,bigint),
  public.social_mark_read(uuid,uuid[],boolean), public.social_retain_history(interval)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.revision_payload(uuid), sharing_private.public_identity(uuid),
  sharing_private.display_nickname(uuid), sharing_private.like_contains(text),
  public.social_read_page(uuid,text,text,text,jsonb,bigint),
  public.social_mark_read(uuid,uuid[],boolean), public.social_retain_history(interval)
  TO service_role;
COMMIT;
