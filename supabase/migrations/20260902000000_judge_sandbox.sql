-- Throwaway judge/sandbox users: flags, purge queue, lock sandbox columns, restrict social/public writes.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_sandbox_expiry
  ON public.users (sandbox_expires_at)
  WHERE is_sandbox = true;

CREATE TABLE IF NOT EXISTS public.sandbox_purge_queue (
  user_id UUID PRIMARY KEY,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.sandbox_purge_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.users.is_sandbox IS
  'Throwaway sandbox (judge) account. Service-role writes only.';
COMMENT ON COLUMN public.users.sandbox_expires_at IS
  'When set, this sandbox must be treated as logged-out after this time.';
COMMENT ON TABLE public.sandbox_purge_queue IS
  'Auth user ids queued for storage purge after Auth delete. No FK: the user row is already gone.';

CREATE OR REPLACE FUNCTION public.protect_sandbox_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.is_sandbox := OLD.is_sandbox;
    NEW.sandbox_expires_at := OLD.sandbox_expires_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sandbox_columns ON public.users;
CREATE TRIGGER protect_sandbox_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_sandbox_columns();

DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
CREATE POLICY "Users can create friendships"
  ON public.friendships FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_sandbox)
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = friend_id AND u.is_sandbox)
  );

DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
CREATE POLICY "Users can update own friendships"
  ON public.friendships FOR UPDATE
  USING (
    (auth.uid() = user_id OR auth.uid() = friend_id)
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_sandbox)
  );

DROP POLICY IF EXISTS "Users can update own boxes" ON public.boxes;
CREATE POLICY "Users can update own boxes"
  ON public.boxes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      is_public = false
      OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_sandbox)
    )
  );
