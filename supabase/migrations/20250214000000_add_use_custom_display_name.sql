-- Add use_custom_display_name to user_settings for Personal settings tab.
-- When true, show public.users.name; when false, show provider name (e.g. Google account name).
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS use_custom_display_name BOOLEAN NOT NULL DEFAULT true;
