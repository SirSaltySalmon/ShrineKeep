-- One-time dashboard demo offer: when true, do not show "generate demo" prompt again.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS dashboard_demo_prompt_dismissed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings.dashboard_demo_prompt_dismissed IS
  'When true, the dashboard demo seed offer was dismissed or completed; do not show again.';
