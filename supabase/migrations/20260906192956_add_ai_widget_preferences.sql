-- Keep existing widget visibility and tutorial completion unchanged.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_widget_visible BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS ai_tutorial_reset_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.user_settings.ai_widget_visible IS
  'Show the AI widget on Dashboard and Wishlist; active tutorials remain visible.';
COMMENT ON COLUMN public.user_settings.ai_tutorial_reset_at IS
  'Server-generated restart time used to invalidate saved tutorial progress.';
COMMENT ON COLUMN public.user_settings.dashboard_demo_prompt_dismissed IS
  'Tutorial completed or skipped; reset to false when restarting from Personal settings.';
