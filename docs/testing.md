# ShrineKeep Testing Guide

## Goals

- Catch business-logic regressions early.
- Keep API behavior stable through route-level tests.
- Make release quality measurable and repeatable.

## Current stack

- **Runner**: Vitest
- **Config**: `vitest.config.ts`
- **Coverage focus**: `lib/**/*.ts` (expand over time)

## Commands

- `npm run test`: run all tests once.
- `npm run test:watch`: interactive watch mode.
- `npm run test:e2e`: Playwright smoke tests.
- `npm run check`: baseline CI-safe test gate.
- `npm run check:full`: lint + typecheck + test (release readiness).

## Test matrix

- **Unit tests (implemented)**
  - `lib/utils.test.ts`
  - `lib/subscription.test.ts`
  - `lib/api/create-item.test.ts`
  - `lib/services/request-parsing.test.ts`
- **Route tests (implemented)**
  - `app/api/items/paste/route.test.ts`
  - `app/api/items/move/route.test.ts`
  - `app/api/boxes/move/route.test.ts`
  - Additional API route contract tests across settings, tags, colors, photos, demo seed/prompt, subtree, stats, wishlist, items/boxes lifecycle, and Stripe control routes
- **Route tests (next)**
  - Stripe webhook status transitions and signature handling
  - Authentication and validation edge cases on remaining write routes
- **E2E smoke tests (planned)**
  - `e2e/smoke.spec.ts` covers:
    - landing page render
    - login page render
    - unauthenticated dashboard redirect
    - authenticated sign-in/dashboard smoke (env-gated)
    - authenticated collection creation smoke (env-gated)

## Writing new tests

- Keep tests deterministic and fast (<100ms each where possible).
- Mock infra boundaries (`supabase`, external APIs).
- Assert both success and primary failure branches.
- Prefer behavior assertions (response + operations) over implementation details.

## Caching and invalidation test guidance

- For dashboard caching rollout (TanStack Query), test at two levels:
  - query key behavior: correct key composition by `userId`, `parentBoxId`, `boxId`, and `searchQuery`,
  - mutation invalidation: changed keys are invalidated after successful writes.
- Include paste mutation invalidation in test coverage:
  - `/api/items/paste` and `/api/boxes/paste` should trigger invalidation of affected folder/root item/box queries.
- Keep invalidation assertions targeted (specific keys) to avoid masking stale-data regressions.

## CI expectations

- Every PR should pass `npm run check`.
- For high-risk refactors or release branches, run `npm run check:full` before merge.
