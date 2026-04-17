# ShrineKeep
## "Consumerism has never been this organized."

Collection manager web app for tracking items, value, spending, and wishlist progress.

- Live site: [shrinekeep.com](https://www.shrinekeep.com)

## What ShrineKeep does

- Organizes collections in nested boxes (folder-style hierarchy).
- Tracks item metadata: value, acquisition date/price, photos, tags.
- Supports wishlist-to-acquired workflow.
- Visualizes value history over time.
- Includes filtered search, sharing, theming, and drag-and-drop movement.

## Core user flow

1. Public user lands on `/landing`.
2. Authenticated users are routed to `/dashboard`.
3. `/dashboard` is the primary workspace:
   - browse boxes and items,
   - run search and filters,
   - create/edit/delete/move content.
4. `/wishlist` manages public/private wishlist and sharing.
5. `/settings` controls profile, theme, and billing/subscription settings.

## Architecture overview

### Frontend

- Next.js App Router (TypeScript, React).
- UI: Tailwind + shadcn/ui + Radix.
- Interaction-heavy dashboard UX with drag/drop and selection mode.

### Backend and data

- Supabase:
  - Auth,
  - Postgres (RLS-enabled),
  - Storage (`item-photos`, `avatars` buckets).
- Next.js route handlers under `app/api/*` for server actions and integrations.

### Integrations

- Stripe for subscriptions.
- Resend for email and moderation notifications.
- Cloudflare Turnstile for anti-abuse.
- PostHog for analytics.
- Sentry for monitoring.
- SerpAPI for optional image search.

### Main code areas

- `app/` routes, pages, and API handlers.
- `components/` UI and feature components.
- `lib/api/` reusable domain/business logic for item/box operations.
- `lib/supabase/` server/client/service Supabase setup.
- `docs/` project-level documentation.
- Architecture reference: `docs/architecture.md`

## Tech stack

- Next.js 16 + React 18 + TypeScript
- Supabase
- Tailwind CSS + shadcn/ui
- Stripe + Resend + Turnstile
- Recharts, dnd-kit, zustand
- PostHog + Sentry

## Local development

### Prerequisites

- Node.js 18+
- npm
- Supabase project

Optional: Stripe, Resend, SerpAPI, Turnstile.

### Quick start

```bash
git clone https://github.com/SirSaltySalmon/ShrineKeep
cd ShrineKeep
npm install
cp .env.local.example .env.local
npm run dev
```

For complete setup (Supabase schema, buckets, OAuth, troubleshooting), see `SETUP.md`.

## Environment variables

Minimum required for local app boot:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional integrations require additional variables (Stripe, Resend, Turnstile, SerpAPI, Sentry). Use `.env.local.example` as the source of truth.

## Quality workflow

### Scripts

- `npm run dev` - start local dev server
- `npm run lint` - ESLint checks
- `npm run typecheck` - strict TypeScript check
- `npm run test` - unit tests (Vitest)
- `npm run test:watch` - watch mode for unit tests
- `npm run test:e2e` - Playwright smoke tests
- `npm run check` - CI-safe unit test gate
- `npm run check:full` - lint + typecheck + test (full quality pass)

### CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs:

- unit tests

on pushes to `main` and pull requests.

## Testing strategy

Automated tests are now bootstrapped with Vitest and should be expanded in layers:

1. Unit tests for pure logic in `lib/*`.
2. Route handler tests for high-risk APIs (`/api/items/*`, `/api/boxes/*`, billing webhooks).
3. E2E smoke tests for core journeys (auth, create/move item, wishlist acquisition flow).

Current maintainability roadmap and execution details:

- `docs/maintainability-plan.md`
- `docs/testing.md`

## Security model

- RLS is enabled on data tables.
- Server routes verify ownership and session auth before writes.
- Storage paths are user-scoped and validated.
- Moderation routes are gated by trusted moderator identity checks.

See `docs/moderation.md` for moderation operations.

## Deployment

Recommended: Vercel.

1. Push repository to GitHub.
2. Import project in Vercel.
3. Configure environment variables.
4. Deploy.

Run `npm run check` before opening a PR, and `npm run check:full` when touching broad areas or preparing larger releases.

## Contributing

1. Create a feature branch.
2. Keep changes scoped and testable.
3. Run `npm run check`.
4. Open a PR with a concise change summary and test evidence.
