-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
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
  box_id UUID NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Photos
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_thumbnail BOOLEAN DEFAULT false NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Tags
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_boxes_user_id ON public.boxes(user_id);
CREATE INDEX IF NOT EXISTS idx_boxes_parent_box_id ON public.boxes(parent_box_id);
CREATE INDEX IF NOT EXISTS idx_items_box_id ON public.items(box_id);
CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_item_id ON public.photos(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON public.item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON public.item_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_value_history_item_id ON public.value_history(item_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

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

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NEW.email
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

-- Triggers for updated_at
CREATE TRIGGER update_boxes_updated_at BEFORE UPDATE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wish_lists_updated_at BEFORE UPDATE ON public.wish_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
