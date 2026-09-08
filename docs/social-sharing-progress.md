# Social sharing — work orders

Updated 2026-09-08. Replaces the previous summary ledger, which had drifted out of agreement with the
working tree. Scope and product rules stay in the [implementation plan](social-sharing-implementation-plan.md);
this file says what is true today and what to do next.

## How to use this document

- **Verified state** is fact, with the command or file that establishes it. If you cannot reproduce a
claim there, treat it as false and fix this file.
- **Work orders** are the unit of assignment. Take one whole work order. Each has files, steps, and a
done-when list. Do not take half of one, and do not start a later one because an earlier one looks hard.
- Do not add status prose to this file. Update the verified-state section and check off done-when items.
- Never mark a done-when item complete on the strength of a fixture or a mock. The plan's phrase for this
is "an unexecuted test is reported as unexecuted."



## Scope decisions (2026-09-08)

These were open questions. They are now settled and the work orders below assume them.


| Decision                            | Value                                                   | Consequence                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First release scope                 | Public profiles, wishlist sharing, and Social UI        | T01–T05, T07–T12 in scope. T06 deferred.                                                                                                                                                                                                    |
| Deployment target                   | Local Docker clone `db-clones` only                     | Migrations are written and applied to the clone. No hosted apply is planned or authorized in this phase.                                                                                                                                    |
| Wishlist share links                | **Permanent product surface, not legacy compatibility** | `/wishlist/[token]` stays as a first-class feature alongside the profile Wishlist tab. Only its insecure implementation is replaced. Real public wishlists exist (three on the clone), so audience backfill must map them, not assume none. |
| Avatars bucket                      | Stays public for v1                                     | Avatar authorization is descoped. Avatar bytes are world-readable regardless of blocks; this is a documented v1 limitation, not a defect.                                                                                                   |
| Copy to own dashboard (T06)         | Deferred past first release                             | R20 is not delivered in v1. `copy_jobs` and `media_asset_leases` stay as unused tables.                                                                                                                                                     |
| Box delete, contents-surviving mode | **Move up one level**, replacing move-to-root           | Contents reparent to the deleted box's nearest surviving ancestor, preserving nesting below. See W1C.                                                                                                                                       |
| Visibility increase on move-up      | **Notify, do not prevent**                              | Contents inherit the destination's audience and may become more visible. The owner is warned in the delete dialog; clamping, per-item prompts, and rejection are all out of scope. Explicit Private wishlist flags still win.               |




### Wishlist surfaces — added 2026-09-08

The share link and the profile Wishlist tab are **two intended entry points to the same projection**, and
both stay. Rules stated by the product owner:

- A user may share only their wishlist, without publishing their collection. The link must work on its own.
- A visitor on a share link can follow through to the owner's profile at `/users/[userId]`, where both the
Wishlist and Showcase tabs are available. This is a **new requirement not in the plan** and needs a
profile link on the token page.
- Profile tabs load independently. Opening the Wishlist tab must not fetch showcase data and vice versa;
separate query keys, separate requests.
- When the share link is off, the token URL 404s. The profile is unaffected and shows whatever the
container audiences permit. Empty tabs get neutral empty states; no surface says a wishlist is unpublished.

See the settled design section below for the model these rules come from.

## Settled design — the audience ceiling

Decided 2026-09-08. Plan §5.0 is new and authoritative; §1.2, §5.1, §5.2, §5.3, §7.1, §9.2, §11.1, R11–R13,
R25, R26, §14.3, T02, T04 and §15.1 are amended to match.

Audiences are **totally ordered by breadth**: `public > friends > private`. A container's audience is the
**ceiling** for everything inside it — a child's audience must be **dominated by** its parent's, meaning
equal or narrower. Audience is therefore **non-increasing along every root-to-leaf path**; the shorthand for
the property is that the tree is **monotonically narrowing**.


| Parent       | Permitted child audiences     |
| ------------ | ----------------------------- |
| Public       | Public, Friends only, Private |
| Friends only | Friends only, Private         |
| Private      | Private                       |


A public box inside a private box is not a state the system can hold. Reject it at write time; do not filter
it at read time.

**Which settings this governs.** The two audience dimensions, independently of one another: collection
ceilings collection up to the collection root, and wishlist ceilings wishlist up to the root wishlist
audience. The dimensions do not constrain each other, so a Private collection box may still carry a Public
box wishlist — R14 is intact. The ceiling only forbids a box being wider than its parent *within* a dimension.

`share_financials` **is exempt, deliberately.** It is a field-masking boolean, not an audience. A parent with
finances hidden may still show totals aggregated from descendants that share theirs, exactly as plan §7.1
specifies. Do not "complete" the ceiling by extending it here; that behaviour is wanted.

**Propagation is a clamp, not a copy** — formally a meet, `child := min(child, parent)`. The two directions
are deliberately asymmetric:

- **Restricting cascades.** Narrowing a parent narrows every wider descendant. Private parent, Private subtree.
- **Widening does not cascade.** Descendants keep their narrower values; the owner opts each one in.

Call it "inherit, then restrict — never expand" in review, which is the same model Notion, Drive, and Dropbox
use for nested permissions. Do not call it "inheritance" unqualified: inheritance implies children copy the
parent, which widening deliberately does not do.

**The collection root is a real container** with the same three-audience control. Loose owned items follow
it, and since every top-level box is its child, it is the ceiling for the account: set it Private and nothing
is visible regardless of individual boxes. Publishing anything therefore starts by opening the root and
narrowing from there, and the UI must say so or users will set a box Public and wonder why it is invisible.
Store `root_collection_visibility` and `root_share_financials` next to the existing `root_wishlist_visibility`
and treat root as a virtual box in the predicates. Do not create a physical root row in `boxes` —
`parent_box_id IS NULL` means top-level today, and redefining it would touch every hierarchy query, position
ordering, and paste path for no functional gain.

**Root is virtual in storage and a real node in the query layer.** Decided 2026-09-08, after weighing a
physical root row on architectural grounds rather than functional ones. The row was rejected for two reasons
that are not the ones usually given. It is not a performance question: one row per user, one extra level on
ancestor walks, and `parent_box_id = $1` in place of `parent_box_id IS NULL` are all free, and the
per-account lock contention a hot root row would normally introduce is already the granularity
`sharing_private.lock_accounts` imposes on every box write. The reasons are that `boxes.parent_box_id` is
`ON DELETE CASCADE` under a flat `USING (auth.uid() = user_id)` delete policy, which would make one row's
deletion silently destroy an entire collection; and that the row does not remove the top-level special case
so much as move it from traversal code to enumeration code, where every box listing, picker, breadcrumb, and
count acquires a `NOT is_root` filter.

What the row would have bought — one definition of a container's audience instead of a nullity branch at
every call site — is bought instead by `sharing_private.container_audience`, below. The nullity branch exists
in exactly one function. Anything that needs a container's audience calls it and does not test for null.

Two consequences the function does **not** buy, recorded so nobody assumes them: `items.box_id` stays
nullable, and narrowing a root audience still needs its own trigger on `user_settings` to clamp top-level
boxes, because that half of the invariant is cross-table. Both are accepted.

### What this deletes

This is the largest simplification in the project so far, and most of the work is removal. Under the ceiling
the visible set is **ancestor-closed**: if a box is visible, so is every ancestor. Therefore **detached
showcase roots cannot occur**, and all of the following becomes dead:

- The private-gap logic in `20260907040208_canonical_public_reads.sql` ("private intermediate boxes split roots").
- Detached-grandchild handling in `sharing_private.visible_connected_box_ids` and `sharing_read_stats`
(`20260908120000_public_stats.sql`).
- `displayParentId = NULL` as a signal for a detached root. It now means only "top-level".
- Gap assertions in `supabase/tests/public-reads.sql` and `public-stats.sql` — these assert behaviour for
states that can no longer exist. Replace them with one test proving the invariant cannot be violated.
- "Connected visible subtree" as a distinct concept from "visible subtree".
- Any ceiling guard on paths that move content *upward*. A destination that is an ancestor of the content's
current parent is always wider than or equal to it, so promoted content arrives already dominated by its
new parent. Box delete in move-up mode (W1C) and detaching a wishlist item to root both get this for free.
Only downward and sideways moves can violate the ceiling, so that is the only place the check belongs.

Enforce the invariant in the database and delete the reader code. Do not keep gap handling as
defence-in-depth: unreachable branches that look load-bearing are exactly the complication this change is
meant to remove.

### Tags

Out of scope for every public surface. No public list, detail, profile, wishlist, token, preview, or stats
response carries tag names, colors, IDs, or counts, and no public surface offers tag filter or sort. Remove
the field and its cursor from `PublicItemDetail`, `PublicDetailRequest`, `sharing_read_item_detail`, and the
tests. A public item detail paginates photos only. This deletes the same-owner tag authorization question
from the public path rather than deferring it. Owner-side tags are untouched.

Copying creates no tags for the copier. Whether it ever should is deferred until after copy exists.

## Settled design — root container and the share link toggle

Decided 2026-09-08. Plan §1.2, §6.1, §6.3, §6.5, §9.1, §9.4, R23, R24, §14.3, T11 and §15.1 are amended to
match. Two independent concepts, and the value of keeping them independent is that neither can silently
override the other:

**Root is a container.** A wishlist item with no target box is associated with root, the same way an item
with a target box is associated with that box. Root has a wishlist audience — the existing
`root_wishlist_visibility` column — using the same three values and the same controls as any box. It is not
an account default, not a fallback, and not a second gate. The wishlist audience is one of root's three
settings; it also has a collection audience and a financial flag, per the audience-ceiling section above.

**The share link toggle controls whether a link exists, and nothing else.** The legacy `wishlist_is_public`
boolean survives, renamed, stripped of any authority over item visibility. On: `/wishlist/[token]` resolves.
Off: it 404s. That is the entire effect. Turning the link off hides no content and changes nothing about the
profile.

**There is no "wishlist is not public" state,** so no surface may claim one. An empty Wishlist tab means
nothing is visible to this viewer, which could be an all-Private set of containers or simply no items. Do
not distinguish those for a visitor. Both profile tabs are always present, load independently, and have
neutral empty states of the same kind.

**Preview carries the explanatory load instead.** Since visitors get no message and owners get no hint from
the public surface, the owner-side preview is the only place the model becomes legible. It should report how
many wishlist items are visible out of the total and make clear that each container's audience is the lever.
Counts of the owner's own items are safe to show to the owner.

This is more plan-consistent than gating content on the link would have been: §1.2 already required that
rotating a token cannot make content private while it stays visible through a UUID profile, and §6.3 already
forbade a global switch overriding a box's explicit Public audience. Both rules hold under this design.

## Verified state



### Environment

- `.env.local` points at the disposable Docker project `db-clones`: API `127.0.0.1:54321`, Postgres `127.0.0.1:54322`.
- `SOCIAL_PUBLIC_READS_ENABLED`, `SOCIAL_SHARING_EDITS_ENABLED`, and `SOCIAL_MUTATIONS_ENABLED` are **all** `true`
on the clone (`.env.local:29-31`). `.env.local.example` ships them `false`. This is intentional: the clone is
where these get exercised.
- Clone tables are owned by `supabase_admin`. Apply DDL with
`docker exec -i supabase_db_db-clones psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1`.
- The clone was built from `supabase/schema.sql` plus `data.sql`, then the social migrations
through `20260908140000_revoke_legacy_public_reads.sql`. This is not a proof of a historical migration replay, and it
cannot be: twelve pre-social migrations `ALTER` tables that no migration creates, so `supabase/migrations/`
alone will not build a database from empty. `schema.sql` is the bootstrap and must stay that way until
someone deliberately rewrites history.
- No hosted production change has been made from this repo, and this repo cannot verify hosted state.
Any statement about hosted production belongs in a deployment record, not here.



### What is built and reachable

- Nine public read operations, all wired to routes: profile, boxes, collection items, collection item detail,
wishlist, wishlist item detail, stats, owner guest preview, token wishlist. `lib/sharing/server/read-core.ts`.
The HTML share link at `/wishlist/[token]` now calls that core in-process via `loadTokenWishlistPage`; the
legacy `/api/wishlist/[token]` JSON route is deleted. Client pagination uses `/api/public/wishlist/[token]`.
- Owner media delivery through `/api/media/photo/:id` with authorization before a private, no-store redirect.
- Sharing preview and save at `GET/PUT /api/boxes/[boxId]/sharing`, revision- and count-checked.
- Social mutations, lists, and inbox under `/api/social/*`, transactional, with rate limits and idempotent receipts.
- Public media signing at `/api/public/media/[kind]/[referenceId]`.
- Eighteen social migrations of predicates, invariants, triggers, and service-only RPCs, with SQL tests that pass
on the clone. `npm run test:db:native` runs them against a fresh cluster. Latest: `20260908140000_revoke_legacy_public_reads.sql`.
- A fenced GC worker with proven Storage retry behaviour: `node --env-file=.env.local supabase/tests/media-gc-storage.mjs`.



### What is built but unreachable

These are the ones that make progress look further along than it is.

- **The media upload registry.** `media_register_asset`, `media_finalize_upload`, `media_attach_photo`,
`media_attach_avatar`, `media_lease_asset`, and `media_release_lease` exist in SQL with **zero TypeScript
callers**. Uploads still go browser-direct to Storage from `components/item-dialog.tsx` and
`components/settings/personal-settings.tsx`, and photo rows are inserted with `asset_id` null. Assets are
registered lazily, on the first owner GET of `/api/media/photo/:id`. An asset nobody views is never
registered and can never be garbage collected.
- `public_profiles`**.** The table exists and has a row per user on the clone. **No application code writes
it.** There is no path to set a nickname or a bio. `app/api/settings/route.ts` does not touch it.
- `root_wishlist_visibility` **and** `profile_share_style`**.** Read by SQL predicates, written by nothing.
`app/api/settings/route.ts:173` still writes the legacy `wishlist_is_public`.
- **The GC worker trigger.** The worker and its Edge entry exist. There is no `vercel.json` anywhere in the
repo and no cron declaration. `supabase/operations/schedule-media-gc.sql` is a script for a cluster that
does not yet have `pg_cron` or `pg_net` installed. Nothing wakes the worker.
- `copy_jobs` **and** `media_asset_leases`**.** Created, no consumer, and `copy_job_entries` / `copy_job_assets`
were never created. Deferred by decision, so this is expected — but see the naming rule below.



### What does not exist

`app/social/*`, `app/users/[userId]/*`, `components/social/*`, `components/public-profile/*`,
`lib/copy/*`, `supabase/functions/copy-worker/*`, and anything in `lib/sharing/presentation/` beyond
`capabilities.ts`. T08 through T12 are unstarted as UI.

### Open defects, recorded so they are not rediscovered

1. **Two permission models still run at once**, which plan §13.3 forbids. `is_public` and `wishlist_is_public`
  remain live columns written by settings and some box/item paths; the new audience columns are authoritative
   in the RPCs. They can still drift on a settings save. The legacy `/api/wishlist/[token]` JSON route is gone.
2. `CopyJobState` **in** `lib/sharing/contracts.ts:163` **contradicts its own migration.** TypeScript says
  `running | retry_wait`; the check constraint at `20260907160500_media_lifecycle.sql:34` and the plan both
   say `planning | copying | finalizing`. The first insert a worker attempts would fail.
3. `SHARING_LIMITS` **page sizes are hardcoded at call sites.** `read-core.ts` imports the constant and uses
  `maxChartPoints`, but still uses the literals 20, 21, and 19 for paging. W3 replaces those together.
4. **Adapter failures return 503, not 404.** A parse or signing failure after a successful RPC distinguishes
  "exists but broke" from "not found", against plan §9.3.
5. **Two storage leaks.** `lib/api/patch-item.ts:115-127` updates a photo's `storage_path` in place and
  abandons the old blob; `app/api/users/me/avatar/route.ts` DELETE clears `users.avatar_url` and leaves
   `public_profiles.avatar_asset_id` dangling. An earlier revision of this list counted box delete in
   move-to-root mode as a third leak because `lib/api/delete-box.ts` skips the cleanup helper unless mode is
   `delete-all`. That is correct behaviour, not a leak: in that mode the items and their photo rows all
   survive the delete, so there is nothing unreferenced to collect.



## Glossary and naming rules

Pick one name per concept and use it in TypeScript, SQL, routes, and cache keys. Where the columns already
shipped, the SQL name wins and TypeScript adapts.


| Concept                                                                     | Use this                                                                                                           | Do not use                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A visibility setting's value                                                | **audience** (`private`/`friends`/`public`)                                                                        | "visibility level", "publicity"                                                      |
| The column holding a box's collection audience                              | `collection_visibility`                                                                                            | `is_public` (legacy, being retired)                                                  |
| The person reading a public surface                                         | **viewer**                                                                                                         | actor, requester, visitor                                                            |
| The person performing a mutation                                            | **actor**                                                                                                          | viewer, caller                                                                       |
| The derived permission bucket for a viewer                                  | `viewerCategory` (`guest`/`owner`/`friend`/`stranger`)                                                             | `viewerContext`, "viewer kind"                                                       |
| The account whose content is being read                                     | `ownerId`                                                                                                          | `userId` in service signatures; the route segment stays `[userId]`                   |
| A stored media object                                                       | **asset** (`media_assets`)                                                                                         | "media record", "blob record"                                                        |
| A pointer from content to an asset                                          | **reference** (`photos.asset_id`, `avatar_asset_id`)                                                               | "link", "attachment"                                                                 |
| The per-owner content counter                                               | **revision** (`users.sharing_revision`)                                                                            | version — reserve `version` for `social_friendships.version` only                    |
| A paginated read surface                                                    | **surface** (`boxes`/`items`/`wishlist`)                                                                           | `collection-items` in cache keys; align the cache key to the RPC value               |
| The container holding items with no box                                     | **root**                                                                                                           | "account default", "unassigned", "fallback", "outside boxes"                         |
| A parent's audience acting as an upper bound                                | **ceiling**; a child is **dominated by** its parent                                                                | "inherited" alone, "max visibility", "cap"                                           |
| The audience of a box or of root, resolved uniformly                        | **container audience** / `container_audience(owner, box_id, dimension)`                                            | "effective visibility", "resolved audience", "root default"                          |
| The invariant over a path                                                   | **monotonically narrowing**                                                                                        | "descending", "sorted", "ordered"                                                    |
| Applying a parent's audience to wider descendants                           | **clamp** (a meet)                                                                                                 | "propagate", "copy", "overwrite", "apply to all"                                     |
| The visible set containing all ancestors of any member                      | **ancestor-closed**                                                                                                | "connected", "contiguous"                                                            |
| The owner toggle for `/wishlist/[token]`                                    | **share link** / `wishlist_link_enabled`                                                                           | "wishlist is public", "public wishlist" — those now name a surface, not a setting    |
| A visible box whose parent is invisible, rendered as its own root           | **detached showcase root** — a state the ceiling makes impossible; the term survives only to name what was removed | "detached root", "orphan root", "split root" unqualified                             |
| A wishlist item whose target box was deleted, carrying a preserved audience | **detached wishlist item** / `wishlist_detached_visibility`                                                        | "detached" unqualified — it collides with the showcase term above                    |
| The contents-surviving box delete mode                                      | **move up** / `move-up`                                                                                            | `move-to-root`, "flatten", "unbox", "promote to top level"                           |
| Where move-up sends contents                                                | **the nearest surviving ancestor**                                                                                 | "the parent" alone — it is the parent only when the parent is not also being deleted |


Terms that appear in code and are **not** defined in the plan. Each needs a one-line definition where it is
declared, or a rename: `PublishedViewer`, `PublicSurface`, `ReadScope`, `SharingRpc`, `PublicMediaResolver`,
`tokenShape`, `sessionOwnerId`, `publishedCapabilities`, `FixtureViewer`, `expectedAudience`.

---



## W1 — Revoke legacy public reads and cut over the token wishlist

**Closes:** the T01 privacy acceptance criterion and T11's API half. **Gate for:** everything else.
**Ship as one commit.** Dropping the policies without deleting the legacy route breaks that route; deleting
the route without dropping the policies leaves the data exposed. Neither half is independently correct.

### Files

- New: `supabase/migrations/20260908140000_revoke_legacy_public_reads.sql`
- New: `supabase/tests/legacy-revocation.sql`
- Rewrite: `app/wishlist/[token]/page.tsx`, `app/wishlist/[token]/public-wishlist-client.tsx`
- Delete: `app/api/wishlist/[token]/route.ts`, `app/api/wishlist/[token]/route.test.ts`



### Steps

1. Write the migration. Drop exactly these ten policies, and only these:

  | Table                  | Policy                                                          |
  | ---------------------- | --------------------------------------------------------------- |
  | `public.users`         | `Users can view public profiles`                                |
  | `public.boxes`         | `Users can view public boxes`                                   |
  | `public.items`         | `Users can view items in public boxes`                          |
  | `public.items`         | `Public can view wishlist items for public wishlists`           |
  | `public.photos`        | `Users can view photos in public items`                         |
  | `public.photos`        | `Public can view photos for wishlist items in public wishlists` |
  | `public.wish_lists`    | `Users can view public wish lists of friends`                   |
  | `public.user_settings` | `Public can view settings for public wishlists`                 |
  | `storage.objects`      | `Users can view wishlist item photos`                           |
  | `storage.objects`      | `Public can view wishlist item photos`                          |

   **Keep** `Public can view avatars` — that is the v1 avatars decision, not an oversight. Add a comment in
   the migration saying so, or someone will "fix" it.
   **Keep** the direct `storage.objects` INSERT, UPDATE, and DELETE policies for `item-photos` and `avatars`
   for now. Uploads are still browser-direct until W2, and revoking writes here would break uploading.
   W2 revokes them.
2. Extract the read-core wiring before touching the page. Everything needed to build a core — cursor-secret
  validation, the service client, the `rpc` adapter, and the `createMediaAuthorizeCore` signer — currently
   lives inside `publicReadResponse` in `lib/sharing/server/http.ts:24-32`, which takes a `NextRequest` and
   returns a `NextResponse`. A server page has neither. Pull lines 24-32 into an exported factory in the same
   file (or a sibling), have `publicReadResponse` call it, and let the page call it too. Do not rebuild the
   wiring inline in the page: a second `createMediaAuthorizeCore` construction is a second signing policy.
   Carry the flag check with it. `publicReadResponse` gates on `SOCIAL_PUBLIC_READS_ENABLED !== "true"` at
   line 16, so a page holding its own core would silently ignore the kill switch. The page must honour the
   same flag and render its 404 path when it is off, otherwise the rollback rehearsed in W8 will not actually
   disable the token surface.
3. Rewrite `app/wishlist/[token]/page.tsx` to call the read service in-process. Remove the `fetch` to
  `${baseUrl}/api/wishlist/${token}` at lines 27–29 — that self-request drops the viewer's cookies, so a
   signed-in friend is served guest results and a blocked visitor is served public ones. Resolve the viewer
   with `resolvePublishedViewer` from `lib/sharing/server/viewer.ts`, build a core through the step 2 factory,
   and call `core.tokenWishlist(token, viewer, {})`. Note `tokenWishlist` is a method on the object returned
   by `createPublicReadCore`, not a standalone export — there is nothing importable by that name.
4. Rewrite `public-wishlist-client.tsx` to consume `PublicWishlistItem`, not the owner `Item` type. It
  currently takes `items: Item[]` and renders through the owner `ItemGrid`. Use the read-only capability set
   from `lib/sharing/presentation/capabilities.ts` and paginate with `nextCursor`. While you are in the file:
   its `useLayoutEffect` writes theme variables onto `document.documentElement`. It does clean up on unmount,
   but confirm the restore survives a client-side navigation away and browser Back, which is the case plan
   §9.4 actually cares about.
5. Delete `app/api/wishlist/[token]/route.ts` and its test. **This removes an implementation, not a feature.**
  The `/wishlist/[token]` page and the share-link product surface both stay; the page reaches the canonical
   projection in-process after step 3, so this JSON route has no remaining caller. `/api/public/wishlist/[token]`
   already exists for any client that needs the API form.
6. Add a link from the token page to the owner's profile at `/users/[userId]`, per the wishlist-surfaces
  rules above. `PublicIdentity.id` is already in the DTO, so no contract change is needed. **Deferred to W6**
   — the profile route does not exist yet. Do not land a dead `/users/[userId]` link on the token page.
7. Write `supabase/tests/legacy-revocation.sql`. As `anon` and as an unrelated `authenticated` user, assert
  denial or zero rows for: `users.email`; `user_settings.wishlist_share_token`; `items.acquisition_price`
   and `items.current_value` on another owner's box; `photos` on another owner's item; `wish_lists`;
   and a `storage.objects` select for another owner's wishlist photo path. Assert the owner's own reads
   still succeed for each of those tables — the failure mode to guard against is over-revoking.
8. Run `npm run test:db:native`, `npm run check:full`, and `npm run build`.



### Done when

- [x] The ten policies are gone from the clone; `Public can view avatars` remains.
- [x] `legacy-revocation.sql` passes, including the owner-still-works assertions.
- [x] `/wishlist/[token]` renders for a guest with no `/api/wishlist/[token]` route in the tree.
- [x] Exactly one place in the tree builds the public-read-core wiring (`wirePublishedReadCore` in
  `lib/sharing/server/http.ts`). `createPublicReadCore` has one non-test call site. `createMediaAuthorizeCore`
  still has owner/public media call sites in `lib/media/server/http.ts`; those are a different signing path.
- [x] With `SOCIAL_PUBLIC_READS_ENABLED` unset, the token page 404s just as the API routes do. A page that
  still renders would mean the kill switch no longer covers the surface it is meant to cover.
- [x] A signed-in friend loading a token URL sees friends-only entries; a blocked signed-in visitor is denied.
  This is the assertion the old self-fetch made impossible, so test it deliberately.
- [x] Owner dashboard, wishlist, settings, search, and moderation lookup all still work. Every cross-user
  `users` read in the tree is service-role or self-scoped, so this should hold, but verify rather than assume.
- [x] `npm run build` passes.

---



## W1B — Audience ceiling and collection root

**Closes:** the R11/R12/R25 half of T04, and the read-side simplification in T02 and T07.
**Depends on:** W1. **Runs before W4, W5, and W6** — those build settings and UI against this model, and
doing it later means building the old model twice. Numbered W1B because it was inserted after the sequence
was set; treat it as the second work order.

Mostly a deletion. Read the settled-design section above before starting; the point is to end with less code
than you began with.

### Files

- New: `supabase/migrations/…_audience_ceiling.sql` — root columns, `container_audience`, the invariant,
the clamp, backfill
- New: `supabase/migrations/…_drop_public_tags.sql` or fold into the above
- Edit: `supabase/migrations` consumers — `sharing_update_box`, `sharing_preview_box`,
`sharing_private.guard_box_tree`, `sharing_private.wishlist_item_is_visible`,
`sharing_private.guard_item_targets`, `sharing_private.visible_connected_box_ids`, `sharing_read_page`,
`sharing_read_stats`, `sharing_read_item_detail`
- Edit: `lib/sharing/contracts.ts`, `lib/sharing/server/read-core.ts`, `lib/sharing/server/mutation-core.ts`,
`lib/sharing/server/cursor.ts`
- Edit: `lib/api/create-box.ts`, `lib/api/move-box.ts`, the paste RPCs, `app/api/items/paste/route.ts`,
`app/api/wishlist/import/route.ts`
- Edit: `supabase/tests/public-reads.sql`, `public-stats.sql`, `box-sharing.sql`, `box-invariants.sql`,
`box-paste-inheritance.sql`, `public-item-details.sql`

### The container function

Step 1 adds this and step 2 depends on it. A null `p_box_id` means the collection root and reads
`user_settings`; a non-null one reads `boxes`. After this lands, nothing else in the schema may test a box id
for null in order to decide where an audience comes from.

```sql
CREATE TYPE sharing_private.audience_dimension AS ENUM ('collection','wishlist');

-- The only place that knows root's audience is stored outside `boxes`.
-- Missing settings, missing box, and cross-owner box all fail closed as private.
CREATE FUNCTION sharing_private.container_audience(
  p_owner_id uuid, p_box_id uuid, p_dimension sharing_private.audience_dimension
) RETURNS public.sharing_audience LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(CASE WHEN p_box_id IS NULL THEN
    (SELECT CASE p_dimension WHEN 'collection' THEN s.root_collection_visibility
                             WHEN 'wishlist' THEN s.root_wishlist_visibility END
       FROM public.user_settings s WHERE s.user_id = p_owner_id)
  ELSE
    (SELECT CASE p_dimension WHEN 'collection' THEN b.collection_visibility
                             WHEN 'wishlist' THEN b.wishlist_visibility END
       FROM public.boxes b WHERE b.id = p_box_id AND b.user_id = p_owner_id)
  END, 'private');
$$;
```

The dimension is an enum, not text, so a misspelled dimension fails at deploy instead of silently resolving
to private and rejecting every widening write. Grant it like its neighbours: revoke from `PUBLIC`, `anon`,
and `authenticated`, grant execute to `service_role`.

Coalescing to private inside the function is what lets callers stop fail-closing by hand — it subsumes the
`wishlist_target_box_id IS NULL OR b.id IS NOT NULL` guard at
`20260907034821_social_sharing_foundation.sql:169`. `guard_box_tree` still needs its own existence check at
line 26, because it must tell "parent does not exist" (`invalid parent`) apart from "parent is private"; use
the function for the audience only.

`share_financials` gets a sibling, `sharing_private.container_share_financials(p_owner_id, p_box_id)`, needed
by the items read surface once loose items publish. Keep it a separate function with a name that does not say
"audience": it is exempt from the ceiling and must not look like a third dimension.

### Steps

1. Add `root_collection_visibility` and `root_share_financials` to the private sharing settings record, both
   defaulting to private and false, then add `container_audience` above and route every existing audience
   lookup through it. Do not add a row to `boxes`. Convert these call sites now, before the invariant, so the
   invariant has one thing to call: the inline `CASE` in `sharing_private.wishlist_item_is_visible`
   (`20260907034821_social_sharing_foundation.sql:170-173`), the hand-rolled root and target lookups in
   `20260907125620_wishlist_item_invariants.sql:31-36`, and the two-armed insert inheritance in
   `guard_box_tree` (`20260907124728_sharing_box_invariants.sql:36-42`), which collapses to one assignment
   per dimension with no branch.
2. Add the invariant as a database constraint or trigger, **once per audience dimension**: a box's collection
   audience must be dominated by its parent's collection audience and by the root's, and the same for its
   wishlist audience. Leave `share_financials` alone. This must hold for every writer — the box editor,
   create, move, the paste RPCs, import, and any automated write — which is the reason it belongs in the
   database and not in a route handler.
   `public.sharing_audience` is declared `ENUM ('private','friends','public')`, in ascending order of
   breadth, so Postgres already orders audiences correctly. Domination is `child <= parent` and the clamp is
   `least(child, parent)`. Do not write a rank table, a rank function, or a custom meet — the enum
   declaration order is the ordering, and the guard is one comparison against `container_audience`.
   With `container_audience` in place this is a single predicate covering both the parent-box and the root
   ceiling, because a top-level box passes a null parent and gets root's audience back. There is no separate
   root case to write. The one thing still needing its own trigger is the other direction: narrowing a root
   audience on `user_settings` must clamp top-level boxes, which is cross-table and cannot be expressed as a
   constraint on `boxes`. Order its lock acquisition through `sharing_private.lock_accounts` like every
   other writer.
3. Rewrite propagation in `sharing_update_box` as a clamp rather than an overwrite. Restricting updates only
   the descendants that were strictly wider; widening updates none. The affected count returned by preview
   must be the count that will actually change, so a subtree already Private reports zero.
4. Clamp on move: a box moved under a narrower parent is narrowed to it, in both dimensions. A move must not
   be a route around the ceiling.
   There is deliberately no matching clamp on the *upward* paths. An earlier revision of this work order
   added a step 4b clamping detached wishlist audiences to root; it has been removed. The ceiling already
   guarantees a box's wishlist audience is no wider than root's, so a preserved value can never exceed it,
   and the clamp would have been unreachable code defending an impossible state.
5. Backfill existing rows by clamping any box wider than its parent, then validate the constraint. The clone
   currently has all boxes Private, so expect zero changes there — but write and run the backfill anyway,
   because a zero-row result on the clone is not evidence it is correct.
6. Delete the private-gap and detached-**showcase-root** logic listed in the settled-design section, and the
   tests that assert it. Exactly two assertions are in scope: `public-reads.sql:37` ("private gap detached
   root") and `public-stats.sql:54` ("detached grandchild is its own root"). Replace them with one test per
   entry point proving a widening write is rejected.
   The word "detached" also names an unrelated and surviving mechanism — a wishlist item whose target box
   was deleted, carrying `wishlist_detached_visibility`. Everything in `item-invariants.sql`,
   `social-foundation.sql`, `box-delete.sql`, `contracts.test.ts`, and `privacy-fixtures.ts` matching that
   word belongs to the surviving mechanism and must not be removed. Read the glossary before grepping.
7. Remove tags from the public path: `PublicItemDetail.tags`, `PublicDetailRequest.tagsCursor`, the tag
   keyset in `sharing_read_item_detail`, the parsing in `read-core.ts`, the `tags` surface in `cursor.ts`,
   and the tag assertions in `public-item-details.sql`.



### Done when

- [ ] `sharing_private.container_audience` is the only thing in the schema that reads
  `root_collection_visibility` or `root_wishlist_visibility`, and the only thing that branches on a box
  id being null to locate an audience. Grep both column names and the phrase `wishlist_target_box_id IS
  NULL`; every surviving hit must be about item detachment, not about where an audience lives.
- [ ] No rank function, rank table, or hand-written meet exists. The guard compares audiences with `<=` and
  the clamp uses `least`, relying on the `sharing_audience` enum's declaration order.
- [ ] Root's ceiling and a parent box's ceiling are enforced by the same predicate, with no branch for
  top-level boxes.
- [ ] A widening write is rejected through every entry point: editor, create, move, box paste, item paste,
  import. Test each one; a route that bypasses the guard is the failure this work order exists to prevent.
- [ ] Restricting a parent clamps only strictly-wider descendants, in one transaction, and the preview count
  matches the number actually changed.
- [ ] Widening a parent changes no descendant.
- [ ] Root set Private hides the entire account regardless of box settings; root set Public with a Private
  box still hides that box. Root wishlist set Private hides every box wishlist.
- [ ] A Private collection box with a Public box wishlist still shows its wishlist entries — the dimensions
  must not have been accidentally coupled while adding the ceiling.
- [ ] Mixed-financials totals from plan §7.1 still work: a parent with finances hidden still aggregates from
  children that share theirs. The ceiling must not have leaked onto `share_financials`.
- [ ] Deleting a top-level box leaves its detached wishlist items at the deleted box's audience, and that
  audience is provably never wider than root's — assert the invariant rather than a clamp.
- [ ] Loose owned items not in any box publish according to the root's audience.
- [ ] Backfill ran, the constraint is validated, and no box is wider than its parent.
- [ ] Detached **showcase root** and private-gap code and tests are deleted, not disabled — the two
  assertions named in step 6, and the reader branches that produce them.
- [ ] The detached **wishlist item** mechanism still works. `wishlist_detached_visibility`, the `detached`
  field in `privacy-fixtures.ts`, and their tests in `contracts.test.ts`, `item-invariants.sql`,
  `social-foundation.sql`, and `box-delete.sql` are untouched and still passing. Do not `rg detached`
  and delete what it finds; the word names two unrelated things and only one of them is going away.
- [ ] No public response contains a tag field, and no public cursor has a `tags` surface.
- [ ] `npm run test:db:native`, `npm run check:full`, and `npm run build` pass.

---



## W1C — Replace move-to-root with move up one level

**Closes:** the deletion half of T04. **Depends on:** W1B, because the ceiling is what makes this safe
without new guards. Small and self-contained; can run alongside W2 or W3.

`sharing_delete_boxes` in `move-to-root` mode flattens the whole subtree — every descendant box becomes
top-level and every item anywhere beneath becomes unboxed. An owner deleting one mid-level box loses their
entire organisation below it. Replace it with reparenting one level up, which preserves everything below the
deleted box.

**Visibility may increase, and that is the accepted outcome.** The destination is an ancestor, so it is
wider than or equal to the box being deleted; contents governed by a Friends-only box that land under a
Public parent become Public. The owner is told this before confirming and nothing else is added — no
clamping, no per-item prompts, no refusing the delete. Explicitly Private wishlist items keep their veto and
are the one thing that cannot broaden. Further privacy guardrails on this path are out of scope.

### Files

- New: `supabase/migrations/…_sharing_box_move_up.sql` — replaces `public.sharing_delete_boxes`
- Edit: `lib/api/delete-box.ts` (`BoxDeleteMode`), `lib/services/boxes/delete-boxes.ts` (mode validation)
- Edit: `app/dashboard/dashboard-client.tsx`, `components/selection-action-bar.tsx`,
`lib/hooks/use-dashboard-dialogs.ts`
- Edit: `supabase/tests/box-delete.sql`, `supabase/tests/concurrency.mjs`,
`lib/api/delete-box.test.ts`, `lib/services/request-parsing.test.ts`



### Steps

1. Rename the mode value from `move-to-root` to `move-up` across the contract, the type, the RPC's mode
  check, the UI state, and the tests. This is a pre-launch clone, so change the value rather than keeping a
   compatibility alias.
2. Rewrite the move branch. For each box being deleted, the destination is its **nearest ancestor that is
  not itself in the delete set**, or the collection root when there is none. Reparent that box's direct
   child boxes and its items to the destination and stop; leave everything deeper untouched. Resolving to the
   nearest *surviving* ancestor is what makes a multi-select of a box together with its own parent behave
   sensibly instead of stranding the inner contents.
3. Retarget wishlist items the same way. Items whose `wishlist_target_box_id` is a box being deleted point at
  the destination instead, or null when the destination is root. Do this inside the RPC before the `DELETE`
   runs, so `sharing_private.preserve_deleted_box_wishlist` finds nothing left to detach and the
   preserve-audience path only fires for the genuine root case.
4. Let the broadening through. `sharing_private.guard_item_targets` raises `privacy_conflict` on exactly this
  shape of retarget — target changed, new audience wider — so as written it will reject the delete. Give the
   RPC a sanctioned route past it, such as a transaction-local flag the guard checks, and document at the
   guard why that route exists. Do not weaken the guard for ordinary moves, and do not touch the
   `wishlist_is_private` veto.
5. Update the dialog copy in both delete surfaces. The option is no longer "Move to root". Suggested copy,
  adjust to taste but keep the visibility sentence:
  > **Move contents up:** Move this box's items and sub-boxes into the box above it, then delete this box.
  > Anything inside will follow the parent's sharing settings, which may make it visible to more people.
  > Wishes you marked Private stay Private.
   When the deleted box is top-level, say "to the top level" rather than "into the box above it".
6. Rewrite `supabase/tests/box-delete.sql` for the new shape and update the `concurrency.mjs` contention
  case, which only needs the renamed mode.



### Done when

- [ ] Deleting a mid-level box moves its direct children and items to its parent, and nesting below those
  children is unchanged. Assert depth, not just parentage — flattening would still pass a parentage-only
  check at the first level.
- [ ] Deleting a box and one of its own ancestors in the same call lands the inner contents on the nearest
  ancestor that survives, and never on a box that was also deleted.
- [ ] Deleting a top-level box puts its contents at the collection root.
- [ ] A Friends-only box deleted under a Public parent leaves its items and wishlist entries Public, with no
  `privacy_conflict` raised and no rows rejected.
- [ ] Wishlist items with the explicit Private flag are still Private afterwards.
- [ ] Both delete dialogs state the visibility consequence before the owner confirms.
- [ ] `rg move-to-root` returns nothing outside Git history.
- [ ] `npm run test:db:native`, `npm run check:full`, and `npm run build` pass.

---



## W2 — Register media on write, backfill, and schedule collection

**Closes:** T05. **Depends on:** W1. Can run in parallel with W3.

Register-on-read cannot reach an asset nobody views, and it forces the eager "unregistered blob" delete
branch to live alongside the GC queue forever. Move registration to the write path and the second branch
deletes itself.

### Files

- New: server upload route under `app/api/media/` that orchestrates `media_register_asset`, a signed upload,
then `media_finalize_upload` and `media_attach_photo` / `media_attach_avatar`
- New: `supabase/migrations/…_backfill_media_assets.sql` (bounded, restartable)
- New: `supabase/migrations/…_restrict_direct_storage_writes.sql`
- Edit: `components/item-dialog.tsx`, `components/settings/personal-settings.tsx`,
`lib/api/create-item.ts`, `lib/api/patch-item.ts`, `lib/api/delete-box.ts`,
`lib/api/photo-storage.ts`, `app/api/users/me/avatar/route.ts`
- Decide and add: the GC trigger (see step 5)



### Steps

1. Build the server upload route. The browser asks for an upload target, uploads, then confirms; the server
  owns every RPC call. Do not let the browser choose the object path.
2. Populate `asset_id` on every photo insert in `create-item.ts` and `patch-item.ts`.
3. Write the backfill for existing `photos` rows and avatars, in bounded restartable batches, reusing
  `media_register_legacy_photo`. Report unresolvable references by ID rather than skipping them silently.
4. Fix the two storage leaks from the defect list: the in-place `storage_path` update and avatar DELETE
  leaving `avatar_asset_id` set. Do not add cleanup to the box move-up path; nothing is unreferenced there.
5. Choose the GC trigger and commit it to the repo. Two options, pick one and write it down: Supabase Cron
  with `pg_cron` and `pg_net` invoking the Edge function every minute, or a `vercel.json` cron hitting a new
   authenticated Next route that calls the same worker core. The Vercel option shares a mechanism with the
   pending judge-sandbox sweep in `TODOS.md`; the Supabase option keeps the work off the web tier. Either
   way the repo must contain the schedule, not a script to run by hand.
6. Only after uploads go through the server, add the migration revoking direct `storage.objects`
  INSERT/UPDATE/DELETE on `item-photos` for the `authenticated` role.
7. Route moderation ban-user, moderation delete-storage, and the judge sandbox sweep through the GC queue
  instead of eager recursive Storage purges, so `media_assets` cannot end up describing objects that are gone.



### Done when

- [ ] A fresh upload produces a `ready` `media_assets` row and a `photos.asset_id` before any read occurs.
- [ ] Backfill leaves zero `photos` rows with a Supabase `storage_path` and a null `asset_id`, or reports each
  exception by ID.
- [ ] Direct browser Storage writes to `item-photos` are denied and uploading still works.
- [ ] The GC schedule is in the repo and observed to drain the queue on the clone without manual invocation.
- [ ] Deleting a box in move-up mode leaves every surviving item's photo blob in place and reachable.
- [ ] `media-lifecycle.sql`, `owner-media.sql`, `media-gc-worker.sql`, and `media-gc-storage.mjs` all pass.

---



## W3 — Re-freeze contracts and unify names

**Closes:** T00. **Depends on:** nothing. Small; do it early so later work stops drifting.

### Steps

1. Fix `CopyJobState` in `lib/sharing/contracts.ts:163` to match the check constraint and the plan:
  `queued | planning | copying | finalizing | completed | failed | cancelled`. It is deferred work, not
   dead work, and a wrong frozen type is worse than none.
2. Make `read-core.ts` read the page-size members of `SHARING_LIMITS`. Defect 5 in the list above overstated
  this: the constant *is* imported and `maxChartPoints` is used, so do not delete it. What is hardcoded is
   the paging arithmetic — `publicPageSize`/`detailPageSize` appear as the literals 20 and 21 at lines 177,
   186, 196, 227, 228, 240-241, and 247-248. The 21 is the over-fetch sentinel and the 19 is the last index
   of a full page, so replace all three together and derive the latter two rather than leaving them literal;
   changing the page size while a `19` survives is precisely the off-by-one this step exists to prevent.
3. Map adapter parse and signing failures to `not_found` where the resource may or may not exist, keeping
  503 only for genuine infrastructure failure.
4. Apply the glossary above. The mechanical renames are `viewerContext` to `viewerCategory` in comments,
  and the cache surface `collection-items` to `items` so it matches the RPC.
5. Add a one-line doc comment at the declaration of each undefined term listed in the glossary section.



### Done when

- [ ] `CopyJobState` matches `20260907160500_media_lifecycle.sql:34`.
- [ ] No page size literal appears outside `SHARING_LIMITS`, including the over-fetch sentinel and the
  last-index expression. Changing `publicPageSize` to a different number and re-running the read tests
  produces correct paging with no edit anywhere else.
- [ ] Every term in the "not defined in the plan" list has a definition at its declaration.
- [ ] `npm run check:full` passes.

---



## W4 — Public profile and wishlist audience write paths

**Closes:** T12's backend. **Depends on:** W1. **Blocks:** T10 and T12 UI.

`public_profiles` has no writer, so nickname and bio are unreachable, and settings still writes the legacy
wishlist boolean. Until this exists there is nothing for the profile UI to edit.

### Steps

1. Add a transactional profile-settings operation writing `public_profiles.nickname` and `bio` together with
  `user_settings.root_wishlist_visibility` and `profile_share_style`. Plan §3.2 requires one transaction for
   owner settings spanning account, profile, and sharing records.
2. Validate per plan §1.2: nickname reuses the existing name length limit, bio is plain text at most 500
  Unicode characters, matched client and server. No HTML, no Markdown, no link previews.
3. Never derive a public nickname from `users.name` or from `use_custom_display_name`. That flag defaults
  true and is not consent. The existing name may appear as a private suggestion in the settings form only.
4. Rename `wishlist_is_public` to `wishlist_link_enabled` and strip its authority over item visibility. It
  keeps exactly one job: gating token resolution. Do not drop the column — it is a live product control.
   Confirm the three existing legacy public wishlists on the clone already map to a public root audience
   (the ledger records this was done) and that their link toggle is on. Also verify the per-box wishlist
   audiences for those owners were set by the conservative plan §13.2 rule and not left Private where the
   collection box was Public. The consumers to update are:
   `app/api/settings/route.ts`, `app/api/settings/route.test.ts`, `lib/settings.ts`, `lib/types.ts`,
   `app/wishlist/page.tsx`, `app/settings/settings-client.tsx`, `components/wishlist-sharing-panel.tsx`,
   `components/settings/options-settings.tsx`, `components/boneyard-fixtures.tsx`. That is the complete
   consumer list as of 2026-09-08; drop the column in its own migration once nothing reads it.
5. Do the same for `boxes.is_public`: `lib/api/create-box.ts:54` and the paste RPC still set it. Stop
  writing it, then drop it. Unlike the wishlist link toggle, this one has no surviving purpose.
6. Teach `sharing_resolve_wishlist_token` to check the link toggle. It currently resolves by token value
  alone (`20260908094600_public_wishlist_token.sql:9-15`) and 404s only for an unknown token, an
   unpublishable owner, or a block, so a disabled link would still resolve. Add the flag check in the same
   `not_found` branch so the failure stays generic and reveals nothing about why.
7. Present root as a container in the settings and sharing UI, using the same audience control as a box —
  labelled for items not filed in a box. Do not label it a default or a fallback. The box sharing editor
   and the root control should share a component so the vocabulary cannot drift.
8. Build the preview comprehension surface: visible-count out of total, and copy that points the owner at
  the per-container audiences. This is now a required feature, not a convenience, because it is the only
   place the model is explained to anyone.



### Done when

- [ ] An owner can save a nickname and bio, and they appear on the public profile read.
- [ ] A new account's public label is the neutral `Collector-<suffix>` fallback until a nickname is saved.
- [ ] `root_wishlist_visibility` is the only authority for wishlist items associated with root.
- [ ] `wishlist_link_enabled` is the only remaining job of the old boolean; `boxes.is_public` has no readers
  and is dropped.
- [ ] Link off returns 404 on the token URL while the same entries stay visible on the profile Wishlist tab.
  Test both halves; passing only the first would mean the toggle is still gating content.
- [ ] A Private *collection* root with a Public root wishlist publishes loose wishlist items. (The earlier
  version of this item said a Private root wishlist could coexist with a Public box wishlist; the
  symmetric ceiling decided 2026-09-08 makes that unrepresentable.)
- [ ] Root's audience control is the same component as a box's, and is not labelled a default.
- [ ] Preview shows a visible-out-of-total count that changes when a container's audience changes.
- [ ] Cancel in the settings form issues no write.

---



## W5 — Reusable presentation and capabilities

**Closes:** T08. **Depends on:** W3. Extraction only; no new product behaviour.

Extract the presentation interfaces from `components/box-grid.tsx`, `components/item-grid.tsx`, the item
detail components, and the Box Stats components so both the owner Dashboard and the public profile render
through them. Extend `lib/sharing/presentation/capabilities.ts` past its current six booleans into the
props those components actually need. Public mode must not be able to reach an edit, delete, acquire, or
drag handler, and must not mount owner data hooks, AI agent context, WebMCP tools, or subscription state.

### Done when

- [ ] Owner Dashboard and Wishlist behave exactly as before, verified by their existing tests.
- [ ] The same card, detail, and stats components render from public fixtures with read-only affordances.
- [ ] Public mode renders with no hidden or owner-only field present in its props.
- [ ] Keyboard, touch, and theme behaviour is covered by tests.

---



## W6 — Public profile UI and guest preview

**Closes:** T10 and T11's UI. **Depends on:** W1, W4, W5, and T07 (already built).

Build `app/users/[userId]/*` and `components/public-profile/*`: header with nickname, avatar, bio, and the
relationship control; Wishlist and Showcase tabs; visible roots and nested navigation; reused Box Stats.
Add the "Preview public wishlist" toggle in the owned Wishlist tab against `/api/wishlist/preview`, which
already forces the guest projection.

Two things here are easy to get wrong and are worth naming. Theme precedence is owner-shared, then visitor,
then application default, and the visitor's theme must be restored on navigation, Back, and refresh — a
route-scoped provider, not a document mutation. And navigation always represents the viewer, so a guest gets
the signed-out variant and never sees the profile owner's name presented as the signed-in account.

Copy to own dashboard is deferred, so render no copy affordance at all rather than a disabled one.

### Done when

- [ ] Owner, friend, stranger, guest, and blocked fixtures each match the contracts.
- [ ] The private-gap case is unreachable. Attempt to construct one through the UI and confirm the write is
  rejected. This item previously required rendering two detached roots; W1B removed that behaviour and
  the ceiling makes the state unrepresentable, so rendering it correctly is no longer a passing result.
- [ ] Owner preview and a genuinely signed-out browser show identical entries, order, fields, empty state,
  and theme. Compare in two isolated sessions, not by reasoning about the code.
- [ ] Page titles, Open Graph metadata, and the hydration payload carry only the safe projection.
- [ ] Visiting a profile does not alter the visitor's saved theme or the owner's editor data.
- [ ] Both tabs are always present and each fetches only its own data when opened. Verify with the network
  panel, not by reading the hook.
- [ ] Empty tabs show neutral empty states. No string anywhere claims a wishlist or collection is not public.
- [ ] A profile with nothing public renders normally with two empty tabs rather than a 404.
- [ ] The token page links through to the profile (W1 step 6, deferred to here).

---



## W7 — Social UI

**Closes:** T09. **Depends on:** W5 and T03 (already built).

Build `app/social/*` and `components/social/*`. Friends list bounded to 20 rendered rows with server-side
search, request inbox with incoming and outgoing actions, blocked-user management, and mouse, touch, and
keyboard menus. Bind every action to the current request ID so a stale notification cannot accept a newly
created request. Submit the `components/app-nav.tsx` change as its own small patch.

### Done when

- [ ] A 200-friend account never fetches the whole list and never renders more than 20 friend rows.
- [ ] Search reaches friends outside the loaded page.
- [ ] Every action works without a right-click.
- [ ] A stale or cancelled request cannot be accepted through the UI.
- [ ] After a local block, the blocked profile does not survive in a cached detail view.

---



## W8 — Verification and rollout

**Closes:** T13 and T14. **Depends on:** W1 through W7.

Run the plan's §15.1 matrix against real grants, RLS, and RPCs. The rows that currently have no coverage at
all are the browser matrix across isolated sessions, the full role-bypass probe, representative load, and
theme and cache behaviour across login, logout, and account switching. Record load evidence with the fixture
sizes and query plans, per §12.1, and state the environment rather than implying a tier.

Then: reconcile the deployment migration order, regenerate `supabase/schema.sql` from the clone as the new
mirror, rehearse the feature-disable rollback, and update `docs/architecture.md` and `docs/testing.md`.
Record the actual enabled state separately from code completion — those are different facts and conflating
them is what produced the previous ledger's errors.

### Done when

- [ ] The §15.1 matrix passes against real roles, with any residual limits written down explicitly.
- [ ] Load results state their environment, fixture sizes, and plans.
- [ ] `schema.sql` matches the clone and the migration order is reconciled.
- [ ] Feature-disable rollback is rehearsed and restores no unsafe grant.
- [ ] `npm run check:full`, `npm run build`, `npm run test:db:native`, and the e2e suites all pass.

---

