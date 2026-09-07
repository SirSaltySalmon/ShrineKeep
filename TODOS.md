# ShrineKeep — TODOs

## TODO: Stripe Webhook Failure Recovery

**What:** Build a reconciliation mechanism for the "paid but not Pro" failure state.

**Why:** When `checkout.session.completed` fires and the Supabase upsert fails (rare), the user has paid but doesn't get Pro access. Stripe retries 3x but if all fail, no automatic recovery exists. Currently handled by: log the error, monitor Stripe dashboard for 500s, run manual SQL update.

**Pros:** Eliminates permanent broken state for paying users. Builds trust.

**Cons:** Background job complexity, requires Stripe API integration beyond webhooks.

**Context:** At launch scale (handful of users), manual recovery is fine. Revisit when paid user count makes manual monitoring impractical. Starting point: `app/api/stripe/reconcile/route.ts` that queries Stripe subscriptions API and syncs status to `public.subscriptions` table.

**Depends on:** Phase 1 Stripe integration shipped and monitored for at least 30 days.

---

## Judge sandbox

### Drain sandbox storage via Vercel cron

**What:** Add `vercel.json` daily GET cron to `/api/judge/sweep` authenticated with `Authorization: Bearer CRON_SECRET`, draining the purge queue (storage then drop the queued user id).

**Why:** This PR Auth-deletes expired sandbox users and queues their ids so enter stays fast. Without a scheduled drain, `item-photos/{userId}/` orphans and queue rows sit until a later enter, which still does not walk storage.

**Context:** Hobby cron is once per day in UTC, ~10s timeout. Sweep must batch and time-budget recursive `deleteUserStorage` lists. Reuse `lib/moderation/delete-user-storage.ts`. Do not Auth-delete in the cron without a queue row; the id is already gone from `public.users`. Start at `app/api/judge/sweep/route.ts` once that route exists.

**Effort:** S
**Priority:** P1
**Depends on:** Purge queue table and enter-path enqueue from the judge sandbox PR.

### Gate or unpublish /judge after the hackathon

**What:** Put `/judge` behind a staff-issued token or unpublish the route so production is not a permanent Turnstile-only account factory.

**Why:** v1 is unlisted + Turnstile. That is enough for a weekend of judges. Captcha farms can still mint Auth users and hit GoTrue rate limits.

**Context:** Enter is same-origin and does not send a secret from the browser. After the event, either require a short-lived token the page POSTs, or remove the route from production. Start at `app/judge/page.tsx` and `POST /api/judge/enter`.

**Effort:** S
**Priority:** P2
**Depends on:** Judge sandbox PR shipped.

### Add DESIGN.md via design-consultation

**What:** Run `/design-consultation` and write a DESIGN.md (type, color, density, component vocabulary).

**Why:** This repo has no design system file. UI reviews calibrate against login cards and ad hoc banners. Future features will keep inventing chrome.

**Context:** Coach and `/judge` should keep using existing Card, Dialog, Button, and `WebMcpStatusPanel`. DESIGN.md is for the product, not a blocker for this PR.

**Effort:** M
**Priority:** P3
**Depends on:** None.

---
