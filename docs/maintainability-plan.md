# ShrineKeep Maintainability Plan

This plan is based on a full-pass review of the current Next.js + Supabase codebase and is focused on:

- accurate business logic,
- modular/reusable feature development,
- fast user data loading,
- reliable automated testing.

## Current State Snapshot

### Product flow and UX

- Public entry (`/landing`) -> auth -> `/dashboard` for collection management.
- Primary authenticated flows:
  - `/dashboard`: hierarchical boxes, collection items, drag-and-drop moves, search entry.
  - `/dashboard/search`: global filtered search across user items.
  - `/wishlist`: public/private wishlist management and sharing.
  - `/settings`: profile, theme, billing/subscription management.

### Architecture strengths

- Consistent server/client Supabase boundary (`lib/supabase/*`).
- Clear domain utility areas in `lib/api/*` for item/box operations.
- Practical error handling with user-facing HTTP status mapping in routes.
- Existing observability hooks with Sentry files already integrated.

### Priority risks to address

1. Very large stateful client components (especially dashboard client) make behavior hard to test and extend safely.
2. No meaningful automated test suite before this update.
3. API route logic and business/domain logic are only partially separated; route-level validation patterns vary.
4. No baseline CI checks to keep quality stable over time.

## Execution Completed in This Iteration

1. Added baseline automated unit testing with Vitest:
   - `vitest.config.ts`
   - `lib/utils.test.ts`
   - `lib/subscription.test.ts`
   - `lib/api/create-item.test.ts`
   - `lib/api/validation.test.ts`
   - `app/api/items/move/route.test.ts`
   - `app/api/boxes/move/route.test.ts`
   - `app/api/items/paste/route.test.ts`
   - `app/api/stripe/webhook/route.test.ts`
2. Added quality automation scripts:
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:watch`
   - `npm run check`
   - `npm run check:full`
3. Added CI workflow:
   - `.github/workflows/ci.yml` runs unit tests on push/PR.
4. Updated `README.md` to reflect actual architecture, quality workflow, and extension guidelines.
5. Added maintainability docs and PR process scaffolding:
   - `docs/architecture.md`
   - `docs/testing.md`
   - `.github/pull_request_template.md`
6. Expanded domain coverage for item creation cap and create behavior:
   - `lib/api/create-item.test.ts`
7. Added API performance groundwork:
   - Route timing spans added for `/api/items/paste`, `/api/items/move`, and `/api/boxes/move`
   - Supabase migration: `20260413133000_add_collection_query_indexes.sql`
8. Started dashboard modularization:
   - Extracted live subscription synchronization into `lib/hooks/use-live-subscription.ts`
9. Added E2E smoke-test scaffold:
   - `playwright.config.ts`
   - `e2e/smoke.spec.ts`
10. Continued maintainability phases with service boundaries and dashboard bootstrap optimization:
   - Introduced route-facing service parsers in `lib/services/items/move-items.ts`, `lib/services/boxes/move-boxes.ts`, and `lib/services/boxes/delete-boxes.ts`
   - Updated `/api/items/move`, `/api/boxes/move`, and `/api/boxes/delete` to keep route logic thin (auth + parse + response map)
   - Added request parsing unit tests in `lib/services/request-parsing.test.ts`
   - Prefetched initial root dashboard data server-side in `app/dashboard/page.tsx` (boxes, items, tags) and hydrated `DashboardClient` via initial props to reduce first-load client round-trips
11. Expanded API route coverage substantially:
   - Added route tests for items/boxes lifecycle, settings/tags/colors, demo flows, subtree/stats, wishlist token route, and Stripe subscription control routes
12. Advanced modular dashboard composition and client caching:
   - Extracted hooks: `lib/hooks/use-dashboard-data.ts`, `lib/hooks/use-dashboard-dnd.ts`, `lib/hooks/use-dashboard-dialogs.ts`
   - Added TanStack Query provider (`components/query-provider.tsx`) and integrated cache-backed dashboard loading
   - Added reusable root loader service: `lib/services/dashboard/load-dashboard-root.ts`
13. Expanded E2E smoke coverage:
   - Added env-gated authenticated smoke tests in `e2e/smoke.spec.ts`

## Next Phases (Prioritized)

### Phase 1: Reliability and test coverage (short term)

- Expand unit tests for pure logic:
  - `lib/api/create-item.ts` helpers,
  - validation helpers,
  - search/filter URL/state transforms.
- Add route handler tests for critical APIs:
  - `/api/items/paste`,
  - `/api/items/move`,
  - `/api/boxes/move`,
  - `/api/stripe/webhook` (signature and state transitions).
- Add smoke E2E tests (Playwright) for top user journeys:
  - sign in,
  - create box/item,
  - move item,
  - wishlist mark-as-acquired.

### Phase 2: Maintainable feature composition (mid term)

- Continue splitting `app/dashboard/dashboard-client.tsx` into feature modules:
  - `useDashboardData` (loading and synchronization),
  - `useDashboardDnD` (drag/drop orchestration),
  - `useDashboardDialogs` (modal state/actions),
  - presentational components with smaller prop surfaces.
- Expand API/service boundary conventions started in this pass:
  - route files focus on auth, request parsing, response mapping,
  - domain/services in `lib/services/*` and `lib/api/*` handle business rules.

### Phase 3: Data-load and API performance (mid term)

- Extend the new server-prefetch dashboard bootstrap into a dedicated loader module for reuse/testing.
- Introduce client-side query caching for dashboard data (TanStack Query) with a balanced freshness model:
  - query key model:
    - `["dashboard", "boxes", userId, parentBoxId]`
    - `["dashboard", "items", userId, boxId, searchQuery]`
    - `["dashboard", "unacquired", userId, boxId]`
    - `["dashboard", "tags", userId]`
  - freshness defaults:
    - `staleTime` around 15-30 seconds,
    - targeted invalidation immediately after write mutations.
  - hydration strategy:
    - hydrate root `initialBoxes`, `initialItems`, and `initialUserTags` from `app/dashboard/page.tsx` into query `initialData`.
- Add selective indexes in Supabase for highest-frequency query paths (items by `user_id`, `box_id`, `is_wishlist`, `position`; boxes by `user_id`, `parent_box_id`, `position`).
- Apply pagination/incremental loading for very large collections and search results.
- Add request timing telemetry for key API routes to identify regressions quickly.

#### Mutation-driven cache invalidation requirements

- Invalidate affected dashboard queries after all write routes that change boxes/items state.
- Explicitly include paste routes because they create mutations too:
  - `/api/items/paste`
  - `/api/boxes/paste`
- Minimum invalidation coverage after writes:
  - source and target box item lists,
  - affected parent-box child lists,
  - unacquired/wishlist lists when wishlist-related fields change,
  - root lists when mutation affects root-level data.

### Phase 4: Documentation and contribution quality (continuous)

- Keep `docs/architecture.md` current whenever data flow or route boundaries change.
- Keep `docs/testing.md` in sync with new test layers and quality gates.
- Enforce PR template usage with:
  - risk notes,
  - test evidence,
  - performance impact checklist.

## Quality Gate Recommendation

Use `npm run check` as the baseline local/CI gate and `npm run check:full` for release readiness.

Target merge gate (after debt cleanup) for all PRs:

- lint,
- strict typecheck,
- unit tests.
