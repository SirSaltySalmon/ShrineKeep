# ShrineKeep — TODOs

## TODO: Finish /gstack-design-review (browse tooling)

**What:** Re-run the full design-review skill with the gstack `browse` binary built so we get screenshots, responsive passes, perf, and console checks.

**Why:** The vendored `.agents/skills/gstack` copy in this repo has no `browse/dist/` build output. The partial audit is in `~/.gstack/projects/shrinekeep/designs/design-audit-20260405/design-audit-shrinekeep.com.md`.

**Depends on:** Full gstack checkout or `~/.claude/skills/gstack` with `bun install` && `bun run build`, then `/gstack-design-review` against `https://www.shrinekeep.com/landing` or local `http://localhost:3000`.

---

## TODO: Stripe Webhook Failure Recovery

**What:** Build a reconciliation mechanism for the "paid but not Pro" failure state.

**Why:** When `checkout.session.completed` fires and the Supabase upsert fails (rare), the user has paid but doesn't get Pro access. Stripe retries 3x but if all fail, no automatic recovery exists. Currently handled by: log the error, monitor Stripe dashboard for 500s, run manual SQL update.

**Pros:** Eliminates permanent broken state for paying users. Builds trust.

**Cons:** Background job complexity, requires Stripe API integration beyond webhooks.

**Context:** At launch scale (handful of users), manual recovery is fine. Revisit when paid user count makes manual monitoring impractical. Starting point: `app/api/stripe/reconcile/route.ts` that queries Stripe subscriptions API and syncs status to `public.subscriptions` table.

**Depends on:** Phase 1 Stripe integration shipped and monitored for at least 30 days.

---

## TODO: eBay API Spike (Phase 2 Prerequisite)

**What:** Confirm which eBay API endpoint supports sold/completed item search before writing any Phase 2 code.

**Why:** The design doc specifies `Finding API findCompletedItems` as the likely path. The Browse API may not expose sold items freely and may require Marketplace Insights API approval (not on free tier). Using the wrong endpoint means Phase 2 starts on a broken foundation.

**Pros:** Eliminates the biggest feasibility risk for Phase 2.

**Cons:** ~2-4 hours to register, authenticate, and test.

**Context:** Register at developer.ebay.com. Create a production application key. Call `findCompletedItems` with a test item name (e.g., "Hatsune Miku Nendoroid"). Verify: response includes sold listings, price data, `endTime` field. Confirm rate limits. Document the confirmed endpoint and response shape before Phase 2 build starts.

**Depends on:** Phase 1 shipped. Nothing else.

---
