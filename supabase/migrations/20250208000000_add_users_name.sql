-- Add display name column to public.users (matches Google "name"; used for header display).
-- Keep username for backward compatibility and uniqueness.

-- 1. Add the name column (nullable so we can backfill)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. Backfill name: from auth.users (Google name/full_name) or fallback to username
UPDATE public.users u
SET name = COALESCE(
  au.raw_user_meta_data->>'name',
  au.raw_user_meta_data->>'full_name',
  u.username
)
FROM auth.users au
WHERE au.id = u.id AND (u.name IS NULL OR u.name = '');

-- 3. Any row not in auth.users or still null: use username
UPDATE public.users
SET name = username
WHERE name IS NULL OR name = '';

-- 4. Default for new rows (trigger will override)
ALTER TABLE public.users
ALTER COLUMN name SET DEFAULT '';

ALTER TABLE public.users
ALTER COLUMN name SET NOT NULL;

-- 5. Trigger: set name on new signups (email + Google)
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
