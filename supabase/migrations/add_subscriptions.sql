-- Migration: Add subscriptions table and grandfathered_item_count column
-- Run this in the Supabase SQL editor before deploying Phase 1.

-- Add grandfathered_item_count to users.
-- Set this once at launch for existing users who have > FREE_TIER_CAP items.
-- Run the one-time backfill below after this migration.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS grandfathered_item_count INTEGER;

-- Subscriptions table
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

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription (for client-side display)
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Webhook handler uses service role key — bypasses RLS for INSERT/UPDATE

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);

-- updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ONE-TIME BACKFILL: Set grandfathered_item_count for existing users over the free tier cap.
-- Run this after the migration to grandfather existing users.
-- Replace 50 with FREE_TIER_CAP if it changes.
-- UPDATE public.users u
-- SET grandfathered_item_count = item_counts.count
-- FROM (
--   SELECT user_id, COUNT(*) as count
--   FROM public.items
--   WHERE is_wishlist = false
--   GROUP BY user_id
--   HAVING COUNT(*) > 50
-- ) item_counts
-- WHERE u.id = item_counts.user_id;
