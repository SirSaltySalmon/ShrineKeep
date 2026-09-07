# Social sharing implementation ledger

Started 2026-09-07 from [implementation plan](social-sharing-implementation-plan.md).

## Current state

T00 foundation implemented for review. Contract version 1 remains provisional. T01 additive schema, T02 canonical list reads, T03 relationship transactions/inbox reads, T04 sharing-save transactions, and T05 media registry/GC/authorization have started. T06–T14 remain pending. Additive social migrations are applied on the native test cluster and on a disposable local Supabase clone; they have not been applied to hosted production. Guarded public-read, owner-sharing, social-mutation, social-inbox and public-media API routes now exist but default disabled; no hosted schema, storage buckets, live data, or enabled features changed. Existing owner types and UI remain on their current paths.

Implemented:

- `lib/sharing/contracts.ts`: independent audiences, safe profile/list/detail/media/style/stats DTOs, revision strings, read/sharing/copy service interfaces, errors, and limits.
- `lib/social/contracts.ts`: relationship/request/notification DTOs, actor-scoped operations, bounded-list and refresh defaults.
- `lib/sharing/server/cursor.ts`: HMAC-authenticated versioned cursors bound to owner, viewer identity/category, resource, sort, normalized search, filters, and revision. The future server adapter must canonicalize/allowlist query fields, supply a server-only secret of at least 32 bytes, and reauthorize every page. Cursor validation never grants access.
- `lib/sharing/cache-keys.ts`: distinct owner/public/preview namespaces; social keys scoped to actor with required incoming/outgoing request direction. Future hooks must evict caches on session/relationship changes.
- `lib/sharing/identity.ts`: neutral eight-character UUID suffix; explicit nickname only; 64-code-point nickname and 500-code-point bio bounds. New public nickname validation counts Unicode code points to match PostgreSQL `char_length`; existing private name validation remains unchanged. Render bio as plain text, including any literal markup characters.
- `lib/sharing/sharing-draft.ts`: saved combinations preserved; collection changes suggest wishlist audience until manually changed; propagation defaults on. No writes occur in draft helpers.
- `lib/sharing/presentation/capabilities.ts`: read-only affordances; optional independent copy action. This is not service authorization.
- `lib/sharing/testing/privacy-fixtures.ts`: executable reference model for publication, audience cross-product, explicit-private veto, detached audience, and private tree gaps. These are test expectations, not production permission predicates.

List items contain a single thumbnail, not full photo/history arrays. Details accept independent photo/tag cursors; T02 must validate each cursor's resource scope. Financial history is exposed only through bounded authorized series. Stats preserve existing `cumulativeAcquisition` names and total meanings; adaptive yearly buckets may be needed when monthly full-history series exceed 366 points.

## Requirement fixtures and remaining work

“Reference tested” means unit-tested expected semantics only. It does not assert database, route, or browser coverage.

| Requirement | Contract / fixture status | Required implementation proof |
|---|---|---|
| R01 | Social service operations defined | T09 navigation and inbox fixtures pending |
| R02 | 20-row service default defined | T03 SQL/HTTP 20-row friends/search proof exists; T09 >200 friends and bounded DOM pending |
| R03 | Block/unblock/unfriend operations; private block IDs | T03 private block list proof exists; T09 menus, navigation and keyboard/touch fixtures pending |
| R04 | Current request/version and notifications typed | T03 list/mark-read/retention proof exists; T09 inbox UI pending |
| R05 | UUID-based profile read and guest context typed | T02/T10 guest route fixture pending |
| R06 | Safe identity DTO and neutral nickname tested | T01/T02 actual field allowlist/consent fixtures pending |
| R07 | Published capabilities never enable owner edits | T10 owner settings/navigation fixture pending |
| R08 | Safe theme/font/radius DTO defined | Theme precedence/restore fixtures pending T00/T08 |
| R09 | Separate public list/detail and read-only capabilities | T08 component parity and nullable rendering pending |
| R10 | Private/false/Private defaults; independent fields | T01 defaults and T04 mutation proof pending |
| R11 | Draft defaults propagation on | T04 descendant count, revision and lock fixtures pending |
| R12 | Immediate-parent root reference tested | T02 SQL grouping before pagination pending |
| R13 | A public → B private → C public gap reference tested | T02/T07/T06 connected subtree proof pending |
| R14 | All collection/wishlist audience pairs reference tested | T02 SQL projection proof pending |
| R15 | Reopen/manual suggestion draft behavior tested | T12 save/cancel UI proof pending |
| R16 | Explicit-private cross-product reference tested | T04 structural mutation persistence pending |
| R17 | Token and UUID read interfaces share DTOs | T02/T05/T11 canonical SQL/media parity pending |
| R18 | Expected price separate from collection fields | T02 allowlist/zero/null serialization fixtures pending |
| R19 | Preview interface accepts no viewer; cache split tested | Forced-guest adapter and browser parity pending |
| R20 | Identifier-only enqueue, terminal status union | T06 independent media/worker/quota/crash fixtures pending |
| R21 | Blocked viewers denied; guest behavior reference tested | T03 list/block filters exist; T02/T05/T06 revocation/copy races pending |
| R22 | Request limits defined; no directory API | Exact-link lookup, rate-limit and menu fixtures pending |

Remaining T00 work before calling contracts frozen: runtime DTO projection allowlists and fixtures, explicit profile/media/structural-mutation service contracts, theme precedence fixtures, relationship/copy transition fixtures, cursor key schemas per resource, and complete requirement assertions. T01/T08 can inspect these interfaces but must coordinate any contract changes.

## Integration ownership and migration prerequisites

Integration owner reserves `supabase/schema.sql`, `lib/types.ts`, `components/app-nav.tsx`, deployment configuration, and shared exports. Domain tasks own new files; parallel editing tasks use isolated worktrees. Read-only scouts/reviewers may inspect the shared checkout.

Migration filenames below were created using Supabase CLI 2.116.0 (`npx --yes supabase`). Mandatory order:

1. **T01 additive baseline:** private profile/account revision and sharing columns, canonical social primitives, media/job primitives; explicit grants and RLS for new tables.
2. **T01 reconciliation/backfill:** validate legacy relationships, same-owner references, hierarchy cycles, and asset inventory; stop ambiguous records for reconciliation. Preserve old valid tokens, publish no provider names, infer no financial consent.
3. **T03/T04 transactional invariants:** shared account/pair locking, relationship operations, hierarchy/sharing writes, revision increments, privacy-preserving detach rules. Depend on step 1; constraints validated after step 2.
4. **T05 media lifecycle:** reference tracking, leases/GC, owner delivery compatibility; depends on steps 1–3 and T02 authorization services.
5. **T06 copy worker/finalization:** depends on steps 1–4, T02 filtered manifests and coordinated quota writers. Deploy durable consumer before enabling intake.
6. **T01 coordinated revocation/cutover:** revoke legacy broad reads/RPCs only after compatible T02/T05/T11 code is available; validate actual role bypass tests and private media delivery. Never restore unsafe grants for rollback.
7. **T13/T14 verification and rollout:** actual DB/concurrency/browser/load gates, cleanup/worker schedules, then authorized progressive enablement. Update schema mirror after reconciliation.

## Validation

- Targeted Vitest: 126 tests passed across sharing contracts, cursor validation, read adapters, viewer resolution, and public/owner-sharing HTTP boundaries. Database permission coverage is recorded separately below.
- Scoped ESLint passed for new sharing/social code.
- Production build passed for the canonical public-read slice; owner-sharing route added afterward is typechecked and route-tested. Existing Sentry configuration emits a deprecation warning for `withSentryConfig` import location.
- Repository typecheck passes after replacing Set spread with `Array.from` in `lib/webmcp/review.test.ts:138`, compatible with the current ES5 TypeScript target.
- Independent read-only review found request-direction cache collision and ambiguous detail cursors; both corrected before handoff.
- Native PostgreSQL 16.13: fresh bootstrap, all new social/sharing/media migrations, and the matching SQL suites pass. Tests exercise actual SQL roles/grants/RLS/constraints and service-role RPC calls. Auth/storage schema stand-ins are explicit; this is not Supabase GoTrue/PostgREST/storage or PostgreSQL 17 platform verification.
- Fresh-database runner: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-native.ps1`. Requires native PostgreSQL binaries on PATH, creates a separate temporary cluster on a free loopback port, stops it afterward, and retains logs. It never uses the configured hosted Supabase project.
- Supabase CLI security advisors against isolated local DB: no ERROR findings. WARN findings remain in the pre-existing baseline (`handle_new_user`, `update_updated_at_column`, `protect_sandbox_columns` mutable search paths; `uuid-ossp` in public).
- Five independent-session concurrency cases now pass (details below). Browser, worker, full Supabase platform, representative load and deployment checks remain unrun.

## Database implementation, 2026-09-07

`20260907034821_social_sharing_foundation.sql` adds independent collection/wishlist audiences, explicit-private/detached item fields, service-controlled publication state/revision, private public-profile records, canonical relationship staging, blocks, notifications and rate-limit storage. New tables explicitly revoke client grants and enable RLS. Private SQL predicates implement publication, bidirectional blocks, accepted friendships and independent wishlist audiences. Native tests caught and fixed SQL NULL behavior for guest Friends-only audience checks.

`20260907035318_social_relationship_transactions.sql` adds service-only `social_mutate` plus common ordered account locks and canonical pair locks. It implements request/accept/decline/cancel/unfriend/block/unblock, current request/version guards, notification deduplication/resolution, sender minute/day limits and pair cooldowns. Tests cover duplicate/opposite requests, forged actor calls, acceptance ownership, stale cycles, mutual blocks and cooldowns. HTTP/session adapters and list services are not implemented; mutation success returns no current relationship payload, so adapters must fetch authoritative current state.

Canonical relationships temporarily use `public.social_friendships` so the old directional table can be reconciled before cutover. No legacy relationship records have been copied. New audience columns start conservatively Private; bounded legacy mapping/backfill remains required before enabling features.

Remaining database work includes media/job primitives, reference ownership/cycle constraints and reconciliation, explicit profile provisioning, safe backfills, lifecycle integration for banned/deleting accounts, internal detached-field protection, revision and detach-preservation triggers for all writers, canonical reads, and coordinated legacy policy/RPC revocation. Existing broad read policies still exist: these migrations do not establish production privacy readiness.

Repository bootstrap gap: historical migrations start with ALTERs against tables they never create; `schema.sql` is a standalone non-idempotent mirror. Running the full old migration sequence on that mirror also duplicates policies/triggers and encounters historical font-column assumptions. Native verification therefore loads the mirror once, then the two new migrations; it does not claim complete historical upgrade replay.

Environment findings: bare `supabase` is not on PATH, but `npx --yes supabase` works. Docker engine was stopped. CLI `db query --file` rejected a multi-command SQL file with `cannot insert multiple commands into a prepared statement`; `psql -v ON_ERROR_STOP=1 -f` was used for local transactional SQL instead.

Next work: close remaining T00 service/projection fixtures; finish T01 media/job and ownership primitives with reconciliation; implement T02 canonical reads and T03 HTTP/list adapters; add actual concurrent-session tests, then advance T04/T05/T08 prerequisites. Do not enable social/profile/copy routes before the plan's coordinated privacy cutover.

## Canonical read implementation

`20260907040208_canonical_public_reads.sql` introduces service-only profile context and bounded public pages for showcase boxes, owned items, and independent wishlist items. Root grouping happens before LIMIT; direct children stay nested, and private gaps return detached roots without hidden parent IDs. Owned finances are masked in SQL. Wishlist expected prices remain independent and hidden target metadata is omitted. Every call rechecks publication/block state; revision mismatch produces cursor reset. Pagination retains PostgreSQL timestamp precision and UUID tie-breakers.

`lib/sharing/server/read-core.ts` reconstructs runtime DTO allowlists, trims internal 21-row lookahead to 20 public entries, strips internal keys and signs the next cursor. It rejects malformed/oversized backend responses, preserves bigint revisions, and validates viewer/resource/revision cursor binding. `viewer.ts` distinguishes true guests from failed supplied credentials. Preview accepts only the verified session owner and calls the same wishlist core with a forced guest context.

Guarded GET endpoints: `/api/public/users/[userId]`, `/boxes`, `/boxes/[boxId]/items`, `/wishlist`, and `/api/wishlist/preview`. Responses use `Cache-Control: private, no-store, max-age=0` and vary on Cookie/Authorization. `SOCIAL_PUBLIC_READS_ENABLED` defaults off; `.env.local.example` documents the flag and server-only `SHARING_CURSOR_SECRET`. No runtime flag was enabled.

T02 remains incomplete: avatars/thumbnails/shared styles are deliberately null until canonical media and validated style adapters exist; details, stats, token compatibility, rate limiting, lifecycle coverage, source revision triggers and load evidence remain pending. Existing token routes have not been cut over. Do not interpret these guarded endpoints as production-ready sharing.

New SQL tests cover private-gap root grouping before pagination, bounded direct children/wishlist pages, finance masking and real zero, private collection/public wishlist metadata omission, duplicate-timestamp keyset boundaries, malformed/null keys, blocked users and service-only RPC grants. Read/HTTP tests cover runtime field stripping, guest preview, expired credential denial, no-store headers, default-off gating and generic infrastructure errors. Independent review found a null-key pagination defect, fixed and regression-tested.

## Sharing transaction implementation

`20260907121052_box_sharing_transactions.sql` adds service-only `sharing_preview_box` and `sharing_update_box`. Preview acquires the common owner lock, returns saved independent settings, revision, and full descendant count, and rejects cycles explicitly. Save checks revision/count, applies all three fields in one transaction to the selected scope, preserves item-level Private, and increments owner revision. Rechecking the update traversal avoids silent partial writes if hierarchy changes during the operation; caught exceptions roll back writes before returning conflict/error responses.

`lib/sharing/server/mutation-core.ts` validates audience values, booleans, nonnegative safe counts, and decimal bigint revisions. Guarded GET/PUT `/api/boxes/[boxId]/sharing` derives actor from verified session and box ID from route, bounds JSON reads to 4 KB, rejects cross-origin browser writes, and returns private/no-store responses. `SOCIAL_SHARING_EDITS_ENABLED` defaults false and remains disabled.

`box-sharing.sql` covers preview without writes, propagation, independent combinations, explicit-private preservation, stale revision/count, single-box scope, unauthorized owners, cyclic hierarchy and client RPC denial. Route tests cover auth, spoofed actor/body IDs, malformed/overflowing fields, body limits, cross-origin writes, generic conflict errors and default-off behavior.

T04 remains incomplete: creation inheritance, move/delete/detach/acquire privacy rules, ownership/cycle constraints, all-writer revision/common-lock integration, concurrent-session evidence, and editor integration remain outstanding. The save RPC alone does not prevent existing direct structural writers from bypassing the common lock protocol. Keep sharing edits disabled until those paths are integrated.

## Concurrent-session verification

`npm run test:db:native` now runs `supabase/tests/concurrency.mjs` after the SQL suites. It opens three independent psql sessions against the newly created loopback-only test cluster. Each contention case observes the follower's actual `pg_stat_activity.wait_event = 'advisory'` before committing the leader. It does not substitute timing assumptions or mocked promises for a database lock wait.

Verified cases: concurrent duplicate requests create one notification; opposite requests remain pending; a committed block denies a waiting acceptance; two sharing saves using the same revision leave the first settings intact and reject the second with revision conflict. These tests do not establish child-create/move/delete/copy/quota concurrency safety. All fresh-bootstrap, SQL and four contention cases passed together.

Read-only writer inventory confirms why T04 needs database and application changes together:

- Browser direct writes: Dashboard box creation/name edits, Dashboard/Wishlist acquisition, drag position updates.
- Shared helpers: `lib/api/create-box.ts`, `create-item.ts`, `patch-item.ts`, `move-box.ts`, `move-item.ts`, `delete-box.ts`, and `delete-item.ts`.
- Existing `paste_box_trees_atomic` is used by box paste and demo seed. Its insertion semantics must join inheritance/revision/quota protocols.
- Item suggestion rollback cleanup directly deletes a newly created box.

Next structural slice must cover these paths rather than putting locks only around new sharing endpoints. Current mutations remain disabled until the integrated invariants are verified.

## Box inheritance and direct-write integrity

`20260907124728_sharing_box_invariants.sql` adds triggers covering every box INSERT/UPDATE/DELETE. New roots always start Private/false/Private; new children inherit the parent's three committed sharing values; moving existing boxes preserves their values. New parent links must have the same owner and pass cycle detection. Ownership cannot be transferred. Sandbox/disabled accounts cannot publish through direct box updates.

Authenticated direct box statements acquire the session owner's advisory lock before tuple locks, and row guards validate actor ownership before acquiring another owner's lock. Trusted service RPCs must still acquire ordered account locks before multi-owner writes. Statement-level transition tables advance each affected owner's revision once for a batch, covering name/description/order as well as structural changes. The sharing-save RPC detects that trigger advancement and avoids a second increment.

`box-invariants.sql` verifies actual authenticated writes: root defaults despite supplied public values, inherited independent child settings, preserved settings on moves, one revision increment for a 30-box batch, cross-owner/ownership-transfer denial and sandbox publication denial. Existing box-sharing/public-read tests were updated to use explicit publication after creation and revision values observed from the database.

The fifth contention test starts an authenticated child INSERT while an uncommitted sharing save holds the account lock. It observes the INSERT waiting, commits the save, and verifies the child inherits Friends/true/Public from the committed parent. This proves that case for the direct writer, not only a future API wrapper.

Remaining T04 work: acquire/financial preview, broader-audience consent UX, remaining mutation 409 mapping on paste/import routes, trusted service multi-owner lock ordering, and editor integration. Paste/demo already inherit through box INSERT triggers; native `box-paste-inheritance.sql` proves it. Public and owner-sharing rollout flags remain disabled.

## Item ownership and detached wishlist privacy

`20260907125620_wishlist_item_invariants.sql` covers direct item INSERT/UPDATE/DELETE with the common authenticated statement lock, immutable ownership and same-owner collection/wishlist target checks. Item changes advance owner revisions once per statement. Structural moves/conversions preserve an existing explicit-private veto; clearing that veto requires a separate explicit edit.

Before box deletion, surviving targeted wishlist items are detached while the saved box audience is still readable. Their detached audience therefore survives under a broader account default. Authenticated clients cannot forge detached metadata. Moving a wishlist item to a broader target audience fails with `privacy_conflict` unless the item is explicitly made Private. The explicit “accept broader audience” workflow remains to be implemented; current rejection is fail-closed groundwork, not complete owner UX.

`item-invariants.sql` covers rejected broadening, same-owner targets, Private across acquisition/re-wishlist transitions, private-box deletion under Public root default, and direct detached-metadata forgery. All six migrations and SQL suites pass together with the five contention cases. Review also prompted explicit self-parent and multi-row box-cycle rollback assertions.

Remaining work includes explicit broadening consent, acquired-item publication/financial handling, and owner editor integration. Item move now maps `privacy_conflict` to HTTP 409. These migrations remain local-only and rollout flags remain disabled.

## Item PATCH privacy conflict response

`PATCH /api/items` now maps the database's exact `P0001` / `privacy_conflict` error to HTTP 409 with a stable code and an actionable message. Expected conflicts do not produce server-error telemetry or expose database details. Regression coverage verifies the response and that failed scalar updates stop before photo, storage, tag, or value-history writes. The 20 focused route/helper tests and TypeScript check pass. Other legacy mutation paths and the explicit Private editor remain pending; rollout flags remain disabled.

## Owner per-item Private control

The item dialog now supports “Use box wishlist visibility” / “Private” through create and sparse edit payloads. Existing saved values populate the editor; omitted legacy fields remain omitted, and unrelated edits do not clear Private. The UI is gated by `NEXT_PUBLIC_SOCIAL_SHARING_EDITS_ENABLED=false`; the API independently requires `SOCIAL_SHARING_EDITS_ENABLED=true` for explicitly supplied privacy fields and validates booleans. Enable both only after the coordinated database/media privacy cutover. Older records lacking the field do not show the editor control.

An edit that clears Private and changes an item target/type must be split into separate saves, matching the database's structural preservation rule rather than silently reporting a visibility change that did not happen. A move plus explicit Private remains supported. The exact effective-audience display and broader-audience consent flow remain pending. Validation: 41 focused tests, TypeScript, and scoped ESLint pass; browser interaction verification remains outstanding. No hosted changes or rollout flags were enabled.

## Dependent content revisions

`20260907131022_sharing_dependent_revisions.sql` adds statement-level invalidation for photos, value history, item/tag links, tags, user settings, and public profiles. Each affected owner advances once per statement; UPDATE includes both old and new owners. Direct authenticated writes acquire the account lock before tuple locks, and private definer helpers have empty search paths and no callable client/service grants. Cascaded item deletion is covered by the existing parent-item invalidation. Trusted writers spanning multiple owners must still pre-acquire ordered account locks before DML.

`dependent-revisions.sql` verifies batch INSERT/UPDATE/DELETE, empty writes, unaffected owners, reassignment, authenticated writes, inaccessible helpers, cascade deletion, and actual canonical cursor-reset responses after content mutations. All seven new migrations and seven SQL suites pass in disposable native PostgreSQL. A sixth real-session contention case verifies that a photo write invalidates an overlapping sharing save's revision. The native harness remains a platform stand-in; hosted/PostgREST and browser checks are pending. Rollout stays disabled.

Review identified legacy cross-owner tag links permitted by the existing policy. Tag changes therefore also invalidate owners of linked items; a regression verifies both owners and the dependent owner's stale cursor. Same-owner link enforcement/reconciliation remains part of the legacy-data cutover. Those legacy cross-owner references can require multiple account locks during direct edits and remain a lock-order reconciliation concern before rollout.

## Social mutation HTTP adapters

Guarded routes: `POST /api/social/requests`, `POST .../accept`, `POST .../decline`, `DELETE .../requests/[requestId]`, `DELETE /api/social/friends/[userId]`, `POST /api/social/blocks`, `DELETE /api/social/blocks/[userId]`. Actor IDs come from verified sessions; request IDs and target IDs come from the path. JSON bodies are bounded to 4 KB. Cross-origin browser writes are rejected. `SOCIAL_MUTATIONS_ENABLED` defaults false.

`social_send_request` records a durable per-actor idempotency receipt only after a successful send, including an already-pending pair. Retrying the same key after cancel/decline acknowledges without creating a new request. Reusing the key for another target returns `idempotency_conflict`. Concurrent duplicate sends produce one receipt and one notification; concurrent mismatched-target reuse cannot create the second request.

Successful mutations return `{ success, revision, invalidated }` so clients can refetch actor-scoped lists. Relationship payloads are not returned; the current list/profile reads remain authoritative.

## Social inbox and bounded list reads

`20260907144600_social_list_reads.sql` adds service-only `social_read_page`, `social_mark_read`, and `social_retain_history`. Every page rechecks the verified actor, publication, and bidirectional blocks. Friends search is parameterized, length-bounded, and matches only public nicknames or the neutral `Collector-` suffix—not email or private names. Lists return at most 21 rows to the adapter, which publishes 20 and signs the next cursor. Block rows contain `userId` and `createdAt` only. Notification `actionableRequest` is null unless the current pending request still exists. Unread counts cover visible unresolved notifications and cap at 100.

Guarded GET routes: `/api/social/friends`, `/requests?direction=`, `/blocks`, `/notifications`. `PATCH /api/social/notifications/read` marks specified owned IDs or all currently visible history. These share `SOCIAL_MUTATIONS_ENABLED` and remain disabled. Cursor signing still requires `SHARING_CURSOR_SECRET`. Retention deletes resolved or read-acceptance history older than 90 days and expired rate-limit rows; pending unresolved request notifications are kept. No cron/worker is scheduled yet (T14).

`social-lists.sql` covers 20-row friend paging, remote-page nickname search, LIKE escaping, private-field omission, incoming/outgoing split, stale request actions, identity-free blocks, mark-read, retention, revision cursor reset, and client RPC denial. Native runner now executes thirteen SQL suites plus ten real-session contention cases.

T03 remaining: T09 UI, scheduled retention wakeup, >200-friend load evidence, and chat-adjacent pair reuse beyond the existing predicates. Do not enable social routes before the coordinated privacy cutover.

## Media registry, authorization, and queued GC

`20260907160500_media_lifecycle.sql` adds service-only `media_assets`, `copy_jobs` primitives, `media_asset_leases`, and `media_gc_queue`. Photos gain `asset_id`; public profiles gain `avatar_asset_id`. New tables revoke client grants and enable RLS. Triggers queue unreferenced assets after photo/avatar reference removal, reject forged or pending attachments, and keep account-then-asset lock order.

Service RPCs: legacy path registration, upload register/finalize, photo/avatar attach, copy leases, reference authorization, GC claim/finalize. Authorization uses the same publication/block/wishlist/collection predicates as T02. Unregistered uploaded paths are not signed until registered. External HTTPS links return without expiry. Pending and deleting assets cannot be served. Live leases and remaining photo/avatar references prevent GC. Claim marks `deleting`; finalize tombstones `deleted` and keeps the immutable path unique.

Guarded `GET /api/public/media/[kind]/[referenceId]` (`photo` or `avatar`) shares `SOCIAL_PUBLIC_READS_ENABLED` and remains disabled. The adapter reconstructs `PublicMedia`, signs uploaded objects for 60 seconds through the service client, and never accepts a caller-supplied bucket or path. Responses use `Cache-Control: private, no-store`. Owner item/photo/box deletes now remove database rows first and skip storage deletion for registered assets.

`media-lifecycle.sql` covers guest/friend/block authorization, explicit-private denial, external links, shared-path reuse, last-reference enqueue, lease-blocked GC, pending avatar rejection, client grant denial, and forged cross-bucket attach. A ninth contention case verifies a live lease prevents a waiting GC claim from marking the object deleting. Focused Vitest: media authorize/HTTP and photo-storage order tests pass with TypeScript and scoped ESLint. No hosted buckets were made private, no GC worker is scheduled, and public list thumbnails remain null until T02 wires these references.

T05 remaining: private-bucket cutover, durable GC consumer, Dashboard/img wiring to `/api/media/...`, avatar replace/remove UI, moderation/account purge integration, and T02 thumbnail/detail wiring. Keep public media disabled until that cutover. Owner signed delivery and owner-scoped legacy registration now exist.

## Atomic box delete and move-to-root

`20260907172603_sharing_box_delete.sql` adds service-only `sharing_delete_boxes`. It locks the owner, rejects missing/foreign/null/oversized IDs, refuses cycles, then performs unbox/reparent/detach/delete in one transaction. Move-to-root keeps the previous flatten behavior: subtree items become unboxed, surviving descendants become roots, selected boxes are deleted, and wishlist items targeting those boxes detach with the saved audience plus any explicit-private veto. Delete-all still cascades descendants and returns the photo rows that existed in the subtree so storage cleanup happens after commit. Nested selected parent+child IDs are counted without requiring `ROW_COUNT` to match after CASCADE.

Owner `POST /api/boxes/delete` calls this RPC through the service client. `BoxMutationError` maps RPC codes to HTTP status. Unregistered blobs are removed only after a successful delete-all. This path is existing owner Dashboard behavior and is not gated by sharing rollout flags.

Native `box-delete.sql` covers duplicate IDs, other-owner denial, flatten/unbox, detached friends audience, delete-all photo inventory, nested selection, cycle refusal, and client grant denial. A tenth contention case waits on the account lock held by an uncommitted sharing preview, then completes move-to-root.

## Owner media delivery and same-owner constraints

`20260907174306_sharing_owner_media_and_ownership.sql` adds composite FKs so a box parent and an item collection/wishlist target must share `user_id`. Clone and native fixture data were already clean. `media_authorize_owner_reference` signs only the authenticated owner of a photo or avatar and ignores publication; public `media_authorize_reference` still hides Private collections from everyone, including the owner. Owner-scoped `media_register_legacy_photo_for_owner` and `media_register_legacy_avatar` refuse other actors. Legacy path parsing also accepts avatars and signed object URLs.

`GET /api/media/[kind]/[referenceId]` is available with social public-read flags off. Guests receive 401. The handler registers only the caller's own legacy upload, then signs for 60 seconds through the service client. Public `/api/public/media/...` stays gated and unchanged.

`box-paste-inheritance.sql` shows `paste_box_trees_atomic` inherits a published parent's three sharing fields. Account-root Private defaults remain covered by box-insert invariants. Item `POST /api/items/move` maps `privacy_conflict` to HTTP 409.

## Local clone rehearsal (T01 reports)

A disposable local stack was started from `! db-clones` (Docker project `db-clones`, API `127.0.0.1:54321`, Postgres `127.0.0.1:54322`). It is not linked to hosted production. `schema.sql` plus the social/sharing/media/delete migrations were loaded onto a restore of `data.sql`. Storage object **blobs** were not copied; only five object metadata rows restored. Repeatable read-only report: `supabase/tests/t01-reconciliation-report.sql`.

Clone inventory: 38 users, 55 boxes, 196 items (85 wishlist), 158 photos, 35 tags, 112 item-tags, 38 settings, 0 legacy friendships. Hierarchy, ownership, and tag links are clean: 0 cross-owner parents/items/wishlist targets/tags, 0 dangling refs, 0 cycles.

Insert-only `public_profiles` provisioning is applied on this clone: 38 rows, all nicknames null, empty bios. 3 settings with legacy `wishlist_is_public` now have `root_wishlist_visibility = public`. Every box collection/wishlist audience remains Private and `share_financials` remains false. `use_custom_display_name = true` is still not treated as public nickname consent.

Photos: 156 missing `storage_path` (mostly `placehold.co` 98, Amazon 31, plus marketplace/CDN hosts); 2 Supabase storage URLs with matching `item-photos` paths; 158 unregistered `asset_id`. 2 users have Supabase avatar URLs. `item-photos` is already private; `avatars` is public.

App `.env.local` points at the disposable local stack with social flags false and a 32-byte `SHARING_CURSOR_SECRET`. Hosted production was not changed. Next: wire Dashboard images to `/api/media`, then T02 thumbnails/details. Do not revoke legacy RLS yet.


## 2026-09-08 — Owner image presentation (T05)

Dashboard item cards, drag cards, saved editor photos and gallery now use `/api/media/photo/:id?image=1`. The owner endpoint reauthorizes before a private/no-store 307; its JSON contract remains compatible. Native images avoid optimizer caching. Raw form URLs stay unchanged. Legacy external-only thumbnails remain a compatibility fallback. Public read-only cards keep their separate delivery path. Also fixed an existing nullable RPC-payload type error in box deletion.

Validation: 18 media unit/HTTP tests pass; repository typecheck passes; scoped ESLint passes with the intentional native-img warning. No browser or clone blob delivery proof yet (clone lacks original blobs). Next: eliminate one-year upload URLs, then T02 details/thumbnails, GC consumer and avatar cutover. Broad RLS and feature gates remain unchanged.
