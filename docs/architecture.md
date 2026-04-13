# ShrineKeep Architecture

This document captures the current system shape and the intended abstraction boundaries for maintainable growth.

## High-level structure

- **App layer**: Next.js routes and route handlers under `app/`.
- **Feature/UI layer**: components and hooks under `components/` and `lib/hooks/`.
- **Domain layer**: business operations under `lib/api/`.
- **Infra layer**: Supabase clients and external integrations under `lib/supabase/`, `lib/monitoring/`, and API routes.

## Runtime boundaries

- Route handlers (`app/api/*`) should:
  - authenticate user,
  - parse request body,
  - call domain/service module,
  - map domain errors to HTTP responses.
- Domain modules (`lib/api/*`) and service modules (`lib/services/*`) should:
  - contain business invariants (ownership, cap checks, move/cycle rules),
  - remain framework-agnostic where possible.
- UI components should:
  - orchestrate view state and event handlers,
  - avoid embedding database/business rules directly.

## Core request flows

### Dashboard bootstrap

```mermaid
sequenceDiagram
  participant U as User Browser
  participant P as /dashboard page
  participant SB as Supabase
  participant C as DashboardClient

  U->>P: GET /dashboard
  P->>SB: auth.getUser()
  P->>SB: users + user_settings + subscription + item_count
  SB-->>P: initial data
  P-->>C: render with initial props
  Note over P,C: Root boxes/items/tags are prefetched server-side
  C->>SB: subsequent folder/search loads as needed
```

### Paste item creation

```mermaid
sequenceDiagram
  participant U as UI
  participant R as /api/items/paste
  participant D as lib/api/create-item
  participant SB as Supabase

  U->>R: POST items payload
  R->>SB: auth.getUser()
  R->>D: createItems(...)
  D->>SB: cap checks + inserts + related data
  D-->>R: item ids + operations
  R-->>U: success/error response
```

### Box move validation

```mermaid
sequenceDiagram
  participant U as UI
  participant R as /api/boxes/move
  participant D as lib/api/move-box
  participant SB as Supabase

  U->>R: POST box ids + target parent
  R->>SB: auth.getUser()
  R->>D: moveBoxes(...)
  D->>SB: ownership validation + cycle checks + batch update
  D-->>R: moved count
  R-->>U: success/error response
```

## Scaling guidelines

- Keep route handlers thin and deterministic.
- Prefer explicit service functions over inline query logic in page/components.
- Introduce feature hooks for large client containers:
  - `useDashboardData`,
  - `useDashboardDnD`,
  - `useDashboardDialogs`.
- Add performance instrumentation around high-frequency API routes before large refactors.
- Use query-keyed client caching (TanStack Query) for dashboard collections:
  - boxes by `parent_box_id`,
  - items by `box_id + searchQuery`,
  - unacquired wishlist items by `wishlist_target_box_id`,
  - tags by `user_id`.
