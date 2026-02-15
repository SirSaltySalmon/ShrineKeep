-- Add color and updated_at to tags for existing deployments
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'blue',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL;

ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_color_check;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_color_check CHECK (color IN ('red','orange','yellow','green','blue','indigo','violet'));

-- RLS: allow users to update own tags (idempotent)
DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at (idempotent)
DROP TRIGGER IF EXISTS update_tags_updated_at ON public.tags;
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
