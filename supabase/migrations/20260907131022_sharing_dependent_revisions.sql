-- Invalidate canonical cursors for dependent public content and owner settings.
BEGIN;
CREATE FUNCTION sharing_private.bump_owned_content_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected uuid[]; owner_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    WITH changed_rows AS (SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows) owners;
  ELSIF TG_OP = 'DELETE' THEN
    WITH changed_rows AS (SELECT * FROM old_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows) owners;
  ELSE
    WITH changed_rows AS (SELECT * FROM old_rows UNION ALL SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows) owners;
  END IF;
  FOREACH owner_id IN ARRAY coalesce(affected, ARRAY[]::uuid[]) LOOP
    PERFORM sharing_private.lock_accounts(owner_id);
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = owner_id;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing_private.bump_owned_content_revision() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION sharing_private.bump_item_content_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected uuid[]; owner_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    WITH changed_rows AS (SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT i.user_id FROM changed_rows r JOIN public.items i ON i.id = r.item_id) owners;
  ELSIF TG_OP = 'DELETE' THEN
    WITH changed_rows AS (SELECT * FROM old_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT i.user_id FROM changed_rows r JOIN public.items i ON i.id = r.item_id) owners;
  ELSE
    WITH changed_rows AS (SELECT * FROM old_rows UNION ALL SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT i.user_id FROM changed_rows r JOIN public.items i ON i.id = r.item_id) owners;
  END IF;
  FOREACH owner_id IN ARRAY coalesce(affected, ARRAY[]::uuid[]) LOOP
    PERFORM sharing_private.lock_accounts(owner_id);
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = owner_id;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing_private.bump_item_content_revision() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sharing_photos_statement BEFORE INSERT OR UPDATE OR DELETE ON public.photos
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_photos_insert_revision AFTER INSERT ON public.photos
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_photos_update_revision AFTER UPDATE ON public.photos
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_photos_delete_revision AFTER DELETE ON public.photos
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_value_history_statement BEFORE INSERT OR UPDATE OR DELETE ON public.value_history
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_value_history_insert_revision AFTER INSERT ON public.value_history
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_value_history_update_revision AFTER UPDATE ON public.value_history
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_value_history_delete_revision AFTER DELETE ON public.value_history
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_item_tags_statement BEFORE INSERT OR UPDATE OR DELETE ON public.item_tags
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_item_tags_insert_revision AFTER INSERT ON public.item_tags
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_item_tags_update_revision AFTER UPDATE ON public.item_tags
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE TRIGGER sharing_item_tags_delete_revision AFTER DELETE ON public.item_tags
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_content_revision();
CREATE FUNCTION sharing_private.bump_tag_content_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected uuid[]; owner_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    WITH changed_rows AS (SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows
      UNION SELECT i.user_id FROM changed_rows t
      JOIN public.item_tags it ON it.tag_id = t.id
      JOIN public.items i ON i.id = it.item_id) owners;
  ELSIF TG_OP = 'DELETE' THEN
    WITH changed_rows AS (SELECT * FROM old_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows
      UNION SELECT i.user_id FROM changed_rows t
      JOIN public.item_tags it ON it.tag_id = t.id
      JOIN public.items i ON i.id = it.item_id) owners;
  ELSE
    WITH changed_rows AS (SELECT * FROM old_rows UNION ALL SELECT * FROM new_rows)
    SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO affected FROM (SELECT user_id FROM changed_rows
      UNION SELECT i.user_id FROM changed_rows t
      JOIN public.item_tags it ON it.tag_id = t.id
      JOIN public.items i ON i.id = it.item_id) owners;
  END IF;
  FOREACH owner_id IN ARRAY coalesce(affected, ARRAY[]::uuid[]) LOOP
    PERFORM sharing_private.lock_accounts(owner_id);
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = owner_id;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing_private.bump_tag_content_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sharing_tags_statement BEFORE INSERT OR UPDATE OR DELETE ON public.tags
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_tags_insert_revision AFTER INSERT ON public.tags
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_tag_content_revision();
CREATE TRIGGER sharing_tags_update_revision AFTER UPDATE ON public.tags
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_tag_content_revision();
CREATE TRIGGER sharing_tags_delete_revision AFTER DELETE ON public.tags
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_tag_content_revision();
CREATE TRIGGER sharing_user_settings_statement BEFORE INSERT OR UPDATE OR DELETE ON public.user_settings
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_user_settings_insert_revision AFTER INSERT ON public.user_settings
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();
CREATE TRIGGER sharing_user_settings_update_revision AFTER UPDATE ON public.user_settings
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();
CREATE TRIGGER sharing_user_settings_delete_revision AFTER DELETE ON public.user_settings
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();
CREATE TRIGGER sharing_public_profiles_statement BEFORE INSERT OR UPDATE OR DELETE ON public.public_profiles
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_public_profiles_insert_revision AFTER INSERT ON public.public_profiles
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();
CREATE TRIGGER sharing_public_profiles_update_revision AFTER UPDATE ON public.public_profiles
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();
CREATE TRIGGER sharing_public_profiles_delete_revision AFTER DELETE ON public.public_profiles
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_owned_content_revision();

-- Cascaded child DELETEs may no longer find a deleted parent item; the parent
-- items DELETE statement already invalidates that owner's revision. Trusted
-- multi-owner writers must pre-acquire ordered account locks before DML.
COMMIT;
