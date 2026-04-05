-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  grandfathered_item_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Boxes (collections/hierarchical containers)
CREATE TABLE IF NOT EXISTS public.boxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_box_id UUID REFERENCES public.boxes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Items
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  box_id UUID REFERENCES public.boxes(id) ON DELETE CASCADE,
  wishlist_target_box_id UUID REFERENCES public.boxes(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  current_value DECIMAL(10,2),
  acquisition_date DATE,
  acquisition_price DECIMAL(10,2),
  is_wishlist BOOLEAN DEFAULT false NOT NULL,
  expected_price DECIMAL(10,2),
  position INTEGER DEFAULT 0,
  CONSTRAINT items_wishlist_target_requires_wishlist
    CHECK (wishlist_target_box_id IS NULL OR is_wishlist = true),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Photos
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT, -- Storage path in bucket (e.g., {user_id}/items/{filename}) for Supabase storage files
  is_thumbnail BOOLEAN DEFAULT false NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Tags
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue' CHECK (color IN ('red','orange','yellow','green','blue','indigo','violet')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(user_id, name)
);

-- Item Tags (many-to-many)
CREATE TABLE IF NOT EXISTS public.item_tags (
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- Value History
CREATE TABLE IF NOT EXISTS public.value_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  value DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Friendships
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- Wish Lists (separate from items for organization)
CREATE TABLE IF NOT EXISTS public.wish_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Wish List Items
CREATE TABLE IF NOT EXISTS public.wish_list_items (
  wish_list_id UUID NOT NULL REFERENCES public.wish_lists(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  PRIMARY KEY (wish_list_id, item_id)
);

-- User Settings (for customization and preferences)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  color_scheme JSONB,
  header_font_family TEXT DEFAULT 'Inter' NOT NULL,
  body_font_family TEXT DEFAULT 'Inter' NOT NULL,
  border_radius TEXT DEFAULT '0.5rem',
  graph_overlay BOOLEAN DEFAULT true,
  wishlist_is_public BOOLEAN DEFAULT false NOT NULL,
  wishlist_share_token TEXT UNIQUE,
  wishlist_apply_colors BOOLEAN DEFAULT false NOT NULL,
  use_custom_display_name BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Subscriptions (Stripe; webhook uses service role for INSERT/UPDATE)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(user_id),
  UNIQUE(stripe_customer_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_boxes_user_id ON public.boxes(user_id);
CREATE INDEX IF NOT EXISTS idx_boxes_parent_box_id ON public.boxes(parent_box_id);
CREATE INDEX IF NOT EXISTS idx_items_box_id ON public.items(box_id);
CREATE INDEX IF NOT EXISTS idx_items_wishlist_target_box_id
  ON public.items(wishlist_target_box_id) WHERE is_wishlist = true;
CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_item_id ON public.photos(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON public.item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON public.item_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_value_history_item_id ON public.value_history(item_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_share_token ON public.user_settings(wishlist_share_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view public profiles"
  ON public.users FOR SELECT
  USING (true);

-- Boxes policies
CREATE POLICY "Users can view own boxes"
  ON public.boxes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public boxes"
  ON public.boxes FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can create own boxes"
  ON public.boxes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own boxes"
  ON public.boxes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own boxes"
  ON public.boxes FOR DELETE
  USING (auth.uid() = user_id);

-- Items policies
CREATE POLICY "Users can view own items"
  ON public.items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view items in public boxes"
  ON public.items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.boxes
      WHERE boxes.id = items.box_id
      AND boxes.is_public = true
    )
  );

CREATE POLICY "Public can view wishlist items for public wishlists"
  ON public.items FOR SELECT
  USING (
    is_wishlist = true AND
    EXISTS (
      SELECT 1 FROM public.user_settings
      WHERE user_settings.user_id = items.user_id
      AND user_settings.wishlist_is_public = true
      AND user_settings.wishlist_share_token IS NOT NULL
    )
  );

CREATE POLICY "Users can create own items"
  ON public.items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON public.items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON public.items FOR DELETE
  USING (auth.uid() = user_id);

-- Photos policies
CREATE POLICY "Users can view own photos"
  ON public.photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = photos.item_id
      AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view photos in public items"
  ON public.photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.boxes ON boxes.id = items.box_id
      WHERE items.id = photos.item_id
      AND boxes.is_public = true
    )
  );

CREATE POLICY "Public can view photos for wishlist items in public wishlists"
  ON public.photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = photos.item_id
      AND items.is_wishlist = true
      AND EXISTS (
        SELECT 1 FROM public.user_settings
        WHERE user_settings.user_id = items.user_id
        AND user_settings.wishlist_is_public = true
        AND user_settings.wishlist_share_token IS NOT NULL
      )
    )
  );

CREATE POLICY "Users can create photos for own items"
  ON public.photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = photos.item_id
      AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete photos for own items"
  ON public.photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = photos.item_id
      AND items.user_id = auth.uid()
    )
  );

-- Tags policies
CREATE POLICY "Users can view own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id);

-- Item tags policies
CREATE POLICY "Users can manage tags for own items"
  ON public.item_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_tags.item_id
      AND items.user_id = auth.uid()
    )
  );

-- Value history policies
CREATE POLICY "Users can view value history for own items"
  ON public.value_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = value_history.item_id
      AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create value history for own items"
  ON public.value_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = value_history.item_id
      AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update value history for own items"
  ON public.value_history FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = value_history.item_id
      AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete value history for own items"
  ON public.value_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = value_history.item_id
      AND items.user_id = auth.uid()
    )
  );

-- Friendships policies
CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendships"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own friendships"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Wish lists policies
CREATE POLICY "Users can view own wish lists"
  ON public.wish_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public wish lists of friends"
  ON public.wish_lists FOR SELECT
  USING (
    is_public = true AND (
      EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (friendships.user_id = auth.uid() OR friendships.friend_id = auth.uid())
        AND friendships.status = 'accepted'
        AND (friendships.user_id = wish_lists.user_id OR friendships.friend_id = wish_lists.user_id)
      )
    )
  );

CREATE POLICY "Users can create own wish lists"
  ON public.wish_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wish lists"
  ON public.wish_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wish lists"
  ON public.wish_lists FOR DELETE
  USING (auth.uid() = user_id);

-- User settings policies
CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Subscriptions policies (webhook uses service role — bypasses RLS for INSERT/UPDATE)
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Public wishlist access policy (for viewing public wishlists by token)
CREATE POLICY "Public can view settings for public wishlists"
  ON public.user_settings FOR SELECT
  USING (
    wishlist_is_public = true AND
    wishlist_share_token IS NOT NULL
  );

-- Wish list items policies
CREATE POLICY "Users can manage items in own wish lists"
  ON public.wish_list_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.wish_lists
      WHERE wish_lists.id = wish_list_items.wish_list_id
      AND wish_lists.user_id = auth.uid()
    )
  );

-- Function to automatically create user profile on signup (name from Google/full_name or username)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, email, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NEW.email,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
      'user_' || substr(NEW.id::text, 1, 8)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atomic box paste: inserts copied boxes, collection items, linked wishlist items, photos, item_tags, and value_history in one transaction.
DROP FUNCTION IF EXISTS public.paste_box_trees_atomic(UUID, UUID, INTEGER, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.paste_box_trees_atomic(UUID, UUID, INTEGER, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.paste_box_trees_atomic(
  p_user_id UUID,
  p_target_parent_box_id UUID,
  p_cap INTEGER,
  p_nodes JSONB,
  p_items JSONB,
  p_wishlist_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER := 0;
  v_new_item_count INTEGER := 0;
  v_inserted_this_round INTEGER := 0;
  v_new_box_id UUID;
  v_new_item_id UUID;
  v_target_box_id UUID;
  v_root_ids UUID[] := '{}';
  v_node RECORD;
  v_item RECORD;
BEGIN
  CREATE TEMP TABLE tmp_nodes (
    temp_id UUID PRIMARY KEY,
    parent_temp_id UUID NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    new_box_id UUID NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_items (
    box_temp_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NULL,
    current_value NUMERIC NULL,
    acquisition_date DATE NULL,
    acquisition_price NUMERIC NULL,
    thumbnail_url TEXT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_history JSONB NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_wishlist_items (
    box_temp_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NULL,
    current_value NUMERIC NULL,
    expected_price NUMERIC NULL,
    thumbnail_url TEXT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_history JSONB NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_nodes (temp_id, parent_temp_id, name, description, position)
  SELECT
    (n->>'temp_id')::UUID,
    NULLIF(n->>'parent_temp_id', '')::UUID,
    COALESCE(n->>'name', ''),
    NULLIF(n->>'description', ''),
    COALESCE((n->>'position')::INTEGER, 0)
  FROM jsonb_array_elements(COALESCE(p_nodes, '[]'::jsonb)) AS n;

  IF NOT EXISTS (SELECT 1 FROM tmp_nodes) THEN
    RAISE EXCEPTION 'nodes payload is required';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_nodes WHERE btrim(name) = '') THEN
    RAISE EXCEPTION 'all boxes must have non-empty names';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_nodes n
    WHERE n.parent_temp_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tmp_nodes p WHERE p.temp_id = n.parent_temp_id)
  ) THEN
    RAISE EXCEPTION 'invalid parent_temp_id in nodes payload';
  END IF;

  INSERT INTO tmp_items (
    box_temp_id,
    position,
    name,
    description,
    current_value,
    acquisition_date,
    acquisition_price,
    thumbnail_url,
    photos,
    tag_ids,
    value_history
  )
  SELECT
    (i->>'box_temp_id')::UUID,
    COALESCE((i->>'position')::INTEGER, 0),
    COALESCE(i->>'name', ''),
    NULLIF(i->>'description', ''),
    CASE WHEN i ? 'current_value' THEN (i->>'current_value')::NUMERIC ELSE NULL END,
    NULLIF(i->>'acquisition_date', '')::DATE,
    CASE WHEN i ? 'acquisition_price' THEN (i->>'acquisition_price')::NUMERIC ELSE NULL END,
    NULLIF(i->>'thumbnail_url', ''),
    COALESCE(i->'photos', '[]'::jsonb),
    COALESCE(i->'tag_ids', '[]'::jsonb),
    CASE WHEN i ? 'value_history' THEN i->'value_history' ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  INSERT INTO tmp_wishlist_items (
    box_temp_id,
    position,
    name,
    description,
    current_value,
    expected_price,
    thumbnail_url,
    photos,
    tag_ids,
    value_history
  )
  SELECT
    (i->>'box_temp_id')::UUID,
    COALESCE((i->>'position')::INTEGER, 0),
    COALESCE(i->>'name', ''),
    NULLIF(i->>'description', ''),
    CASE WHEN i ? 'current_value' THEN (i->>'current_value')::NUMERIC ELSE NULL END,
    CASE WHEN i ? 'expected_price' THEN (i->>'expected_price')::NUMERIC ELSE NULL END,
    NULLIF(i->>'thumbnail_url', ''),
    COALESCE(i->'photos', '[]'::jsonb),
    COALESCE(i->'tag_ids', '[]'::jsonb),
    CASE WHEN i ? 'value_history' THEN i->'value_history' ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_wishlist_items, '[]'::jsonb)) AS i;

  IF EXISTS (SELECT 1 FROM tmp_items WHERE btrim(name) = '')
    OR EXISTS (SELECT 1 FROM tmp_wishlist_items WHERE btrim(name) = '') THEN
    RAISE EXCEPTION 'all items must have non-empty names';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_items i
    WHERE NOT EXISTS (SELECT 1 FROM tmp_nodes n WHERE n.temp_id = i.box_temp_id)
  ) OR EXISTS (
    SELECT 1
    FROM tmp_wishlist_items i
    WHERE NOT EXISTS (SELECT 1 FROM tmp_nodes n WHERE n.temp_id = i.box_temp_id)
  ) THEN
    RAISE EXCEPTION 'invalid box_temp_id in items payload';
  END IF;

  -- Serialize item-cap decisions for this user.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF p_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.items
    WHERE user_id = p_user_id
      AND is_wishlist = FALSE;

    -- Only collection items count toward cap.
    SELECT COUNT(*) INTO v_new_item_count FROM tmp_items;

    IF v_current_count + v_new_item_count > p_cap THEN
      RAISE EXCEPTION 'item_limit_reached:%:%', v_current_count, p_cap USING ERRCODE = 'P0001';
    END IF;
  END IF;

  LOOP
    v_inserted_this_round := 0;

    FOR v_node IN
      SELECT
        n.temp_id,
        n.parent_temp_id,
        n.name,
        n.description,
        n.position,
        p.new_box_id AS parent_new_box_id
      FROM tmp_nodes n
      LEFT JOIN tmp_nodes p ON p.temp_id = n.parent_temp_id
      WHERE n.new_box_id IS NULL
        AND (n.parent_temp_id IS NULL OR p.new_box_id IS NOT NULL)
      ORDER BY n.parent_temp_id NULLS FIRST, n.position, n.temp_id
    LOOP
      INSERT INTO public.boxes (
        user_id,
        parent_box_id,
        name,
        description,
        is_public,
        position
      )
      VALUES (
        p_user_id,
        COALESCE(v_node.parent_new_box_id, p_target_parent_box_id),
        v_node.name,
        v_node.description,
        FALSE,
        v_node.position
      )
      RETURNING id INTO v_new_box_id;

      UPDATE tmp_nodes
      SET new_box_id = v_new_box_id
      WHERE temp_id = v_node.temp_id;

      v_inserted_this_round := v_inserted_this_round + 1;
    END LOOP;

    EXIT WHEN v_inserted_this_round = 0;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tmp_nodes WHERE new_box_id IS NULL) THEN
    RAISE EXCEPTION 'failed to resolve full box tree';
  END IF;

  FOR v_item IN
    SELECT *
    FROM tmp_items
    ORDER BY position
  LOOP
    SELECT n.new_box_id
    INTO v_target_box_id
    FROM tmp_nodes n
    WHERE n.temp_id = v_item.box_temp_id;

    IF v_target_box_id IS NULL THEN
      RAISE EXCEPTION 'missing target box for item';
    END IF;

    INSERT INTO public.items (
      box_id,
      wishlist_target_box_id,
      user_id,
      name,
      description,
      thumbnail_url,
      current_value,
      acquisition_date,
      acquisition_price,
      is_wishlist,
      expected_price,
      position
    )
    VALUES (
      v_target_box_id,
      NULL,
      p_user_id,
      v_item.name,
      v_item.description,
      v_item.thumbnail_url,
      v_item.current_value,
      v_item.acquisition_date,
      v_item.acquisition_price,
      FALSE,
      NULL,
      v_item.position
    )
    RETURNING id INTO v_new_item_id;

    IF jsonb_typeof(v_item.photos) = 'array' AND jsonb_array_length(v_item.photos) > 0 THEN
      INSERT INTO public.photos (item_id, url, storage_path, is_thumbnail)
      SELECT
        v_new_item_id,
        p.url,
        p.storage_path,
        p.is_thumbnail
      FROM jsonb_to_recordset(v_item.photos) AS p(url TEXT, storage_path TEXT, is_thumbnail BOOLEAN);
    END IF;

    IF jsonb_typeof(v_item.tag_ids) = 'array' AND jsonb_array_length(v_item.tag_ids) > 0 THEN
      INSERT INTO public.item_tags (item_id, tag_id)
      SELECT
        v_new_item_id,
        t.id
      FROM jsonb_array_elements_text(v_item.tag_ids) AS raw(tag_id_text)
      JOIN public.tags t
        ON t.id = raw.tag_id_text::UUID
       AND t.user_id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_item.value_history IS NOT NULL
      AND jsonb_typeof(v_item.value_history) = 'array'
      AND jsonb_array_length(v_item.value_history) > 0 THEN
      INSERT INTO public.value_history (item_id, value, recorded_at)
      SELECT
        v_new_item_id,
        vh.value,
        vh.recorded_at
      FROM jsonb_to_recordset(v_item.value_history) AS vh(value NUMERIC, recorded_at TIMESTAMPTZ);
    ELSIF v_item.value_history IS NULL AND v_item.current_value IS NOT NULL THEN
      INSERT INTO public.value_history (item_id, value)
      VALUES (v_new_item_id, v_item.current_value);
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT *
    FROM tmp_wishlist_items
    ORDER BY position
  LOOP
    SELECT n.new_box_id
    INTO v_target_box_id
    FROM tmp_nodes n
    WHERE n.temp_id = v_item.box_temp_id;

    IF v_target_box_id IS NULL THEN
      RAISE EXCEPTION 'missing target box for wishlist item';
    END IF;

    INSERT INTO public.items (
      box_id,
      wishlist_target_box_id,
      user_id,
      name,
      description,
      thumbnail_url,
      current_value,
      acquisition_date,
      acquisition_price,
      is_wishlist,
      expected_price,
      position
    )
    VALUES (
      NULL,
      v_target_box_id,
      p_user_id,
      v_item.name,
      v_item.description,
      v_item.thumbnail_url,
      v_item.current_value,
      NULL,
      NULL,
      TRUE,
      v_item.expected_price,
      v_item.position
    )
    RETURNING id INTO v_new_item_id;

    IF jsonb_typeof(v_item.photos) = 'array' AND jsonb_array_length(v_item.photos) > 0 THEN
      INSERT INTO public.photos (item_id, url, storage_path, is_thumbnail)
      SELECT
        v_new_item_id,
        p.url,
        p.storage_path,
        p.is_thumbnail
      FROM jsonb_to_recordset(v_item.photos) AS p(url TEXT, storage_path TEXT, is_thumbnail BOOLEAN);
    END IF;

    IF jsonb_typeof(v_item.tag_ids) = 'array' AND jsonb_array_length(v_item.tag_ids) > 0 THEN
      INSERT INTO public.item_tags (item_id, tag_id)
      SELECT
        v_new_item_id,
        t.id
      FROM jsonb_array_elements_text(v_item.tag_ids) AS raw(tag_id_text)
      JOIN public.tags t
        ON t.id = raw.tag_id_text::UUID
       AND t.user_id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_item.value_history IS NOT NULL
      AND jsonb_typeof(v_item.value_history) = 'array'
      AND jsonb_array_length(v_item.value_history) > 0 THEN
      INSERT INTO public.value_history (item_id, value, recorded_at)
      SELECT
        v_new_item_id,
        vh.value,
        vh.recorded_at
      FROM jsonb_to_recordset(v_item.value_history) AS vh(value NUMERIC, recorded_at TIMESTAMPTZ);
    ELSIF v_item.value_history IS NULL AND v_item.current_value IS NOT NULL THEN
      INSERT INTO public.value_history (item_id, value)
      VALUES (v_new_item_id, v_item.current_value);
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(new_box_id ORDER BY position), '{}')
  INTO v_root_ids
  FROM tmp_nodes
  WHERE parent_temp_id IS NULL;

  RETURN jsonb_build_object(
    'created_box_ids', v_root_ids,
    'created_items', (SELECT COUNT(*) FROM tmp_items) + (SELECT COUNT(*) FROM tmp_wishlist_items)
  );
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_boxes_updated_at BEFORE UPDATE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wish_lists_updated_at BEFORE UPDATE ON public.wish_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Storage Bucket Policies for item-photos
-- Note: These policies assume the bucket 'item-photos' exists and is PRIVATE
-- File paths should follow: {user_id}/items/{filename}
-- Users can upload files to their own user folder
CREATE POLICY "Authenticated users can upload item photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'item-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own photos
CREATE POLICY "Users can view own item photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'item-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view photos from wishlist items (check if item is wishlist via storage_path)
-- This policy allows authenticated users to view wishlist item photos
CREATE POLICY "Users can view wishlist item photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'item-photos' AND
    EXISTS (
      SELECT 1 FROM public.photos
      JOIN public.items ON items.id = photos.item_id
      WHERE photos.storage_path = storage.objects.name
      AND items.is_wishlist = true
    )
  );

-- Public access to wishlist item photos (for unauthenticated users viewing public wishlists)
CREATE POLICY "Public can view wishlist item photos"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'item-photos' AND
    EXISTS (
      SELECT 1 FROM public.photos
      JOIN public.items ON items.id = photos.item_id
      WHERE photos.storage_path = storage.objects.name
      AND items.is_wishlist = true
    )
  );

-- Users can update their own uploaded files
CREATE POLICY "Users can update own item photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'item-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'item-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own uploaded files
CREATE POLICY "Users can delete own item photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'item-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Avatars bucket for profile pictures. Create the bucket in Dashboard if needed:
-- Storage → New bucket → id: avatars, Public: on, File size limit: 2MB, Allowed MIME: image/jpeg, image/png, image/gif, image/webp
-- Path format: {user_id}/avatar.{ext}

-- Users can upload to their own folder only.
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can view avatars (public bucket).
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Users can update/delete their own avatar.
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
