-- Split single font_family into header_font_family and body_font_family (default Inter).

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS header_font_family TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS body_font_family TEXT DEFAULT 'Inter';

UPDATE public.user_settings
SET
  header_font_family = COALESCE(font_family, header_font_family),
  body_font_family = COALESCE(font_family, body_font_family)
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_settings'
    AND column_name = 'font_family'
);

ALTER TABLE public.user_settings
  ALTER COLUMN header_font_family SET DEFAULT 'Inter',
  ALTER COLUMN header_font_family SET NOT NULL,
  ALTER COLUMN body_font_family SET DEFAULT 'Inter',
  ALTER COLUMN body_font_family SET NOT NULL;

ALTER TABLE public.user_settings DROP COLUMN IF EXISTS font_family;

COMMENT ON COLUMN public.user_settings.header_font_family IS 'Heading typography key (e.g. Inter, Playfair Display).';
COMMENT ON COLUMN public.user_settings.body_font_family IS 'Body typography key (e.g. Inter, Geist).';
