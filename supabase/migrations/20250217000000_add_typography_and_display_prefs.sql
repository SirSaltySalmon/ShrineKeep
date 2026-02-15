-- Typography and display preferences (stored separately from theme color_scheme JSON)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS border_radius TEXT DEFAULT '0.5rem',
  ADD COLUMN IF NOT EXISTS graph_overlay BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.user_settings.font_family IS 'Selected font family key (e.g. Inter, Geist).';
COMMENT ON COLUMN public.user_settings.border_radius IS 'Border radius for UI (e.g. 0.5rem).';
COMMENT ON COLUMN public.user_settings.graph_overlay IS 'When true, draw value and acquisition on one chart; when false, two separate charts.';
