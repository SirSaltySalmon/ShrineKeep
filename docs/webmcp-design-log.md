# WebMCP design log

This is the living planning log for the WebMCP design conversation. Update it as decisions are made in this chat so implementation and product intent remain aligned.

## 2026-09-01 — Initial direction

ShrineKeep will explore WebMCP as a progressive enhancement for users who bring a compatible browser agent. The agent supplies research and reasoning; ShrineKeep supplies authenticated collection context, a reviewable interface, validation, and durable writes.

WebMCP is not a replacement for the existing human interface or a background automation system. Manual collection and wishlist workflows must continue to work when WebMCP is unavailable.

### Core safety model

Agent-facing tools stage suggested changes. They do not directly mutate canonical collection records.

The working flow is:

1. The user opens a box and asks their agent for help.
2. ShrineKeep exposes a small, page-scoped set of tools.
3. The agent reads only the collection context needed for the task.
4. The agent stages suggested edits or a wishlist import.
5. ShrineKeep opens a human-readable review dialog with editable values, rationales, sources, and before/after values.
6. The user selects, modifies, approves, or rejects suggestions.
7. Only approved rows are sent through authenticated ShrineKeep write APIs.

This follows the same collaboration model as reviewing an AI-generated code diff: generation can be fast and imperfect because the user remains the final editor and approver.

### Recursive appraisal scope

The hackathon default appraisal interpretation is:

- typical recent sold price;
- second-hand market;
- shipping excluded;
- based on current condition, with condition inferred by the agent from the item's description;
- a fast estimate, not a formal appraisal.

The agent should justify suggested values in its conversation with the user. Rationales and optional source URLs are also included in the staged review data so the user does not have to rely on chat history alone.

Recursive appraisal is optional and scoped to the box currently open in the dashboard. The agent must explicitly request descendant items through the read tool.

### Acquisition-price scope

For this hackathon, acquisition price may be a researched estimate of original retail price or historical market price. It does not claim to recover the user's actual purchase price.

The user can approve the suggestion, edit the number before approval, or reject it. Receipt, email, bank, and order-history integrations are intentionally out of scope.

### Complete-set wishlist imports

The agent proposes a matched set and its entries. ShrineKeep shows the set name, source, item count, possible existing collection/wishlist matches, and editable item details before import.

A dedicated authenticated wishlist-import operation performs the approved import. Existing-name matches are not silently imported by default, but the user may deliberately include them when multiple copies are wanted.

### Initial WebMCP tools

- `get_current_box_items`: Read collection items in the current dashboard box, optionally including descendants, with pagination.
- `stage_item_edits`: Stage current-value and/or acquisition-price suggestions for review. It never writes items directly.
- `stage_wishlist_import`: Stage a matched set checklist for review. It never creates wishlist entries directly.

Tools are registered only on the authenticated dashboard and follow its current-box lifecycle. The native API is feature-detected so unsupported browsers continue normally.

### Deferred ideas

- Goal-aware "what should I collect next?" recommendations.
- Marketplace purchase guard ("do I own this and is the price sensible?").
- Photo-assisted intake and metadata enrichment.
- Persistent suggestion history, rollback, and provenance tables.
- Currency, condition, grading, catalog identifiers, and structured valuation evidence.
- Background or scheduled valuation refreshes, which are not a WebMCP tab-bound workflow.

### Hackathon tradeoffs

- Suggested changes live in dashboard state until approved or dismissed; persistent draft storage is deferred.
- Approved item edits reuse the existing item patch domain path so current-value changes continue to create value-history records.
- Batch item edits are prevalidated and report per-item failures, but the first implementation is not a single database transaction.
- Wishlist imports contain core text and expected-price fields only. Photos, tags, and catalog-specific metadata are deferred.

## 2026-09-01 — Approval-layer MVP implemented

The first end-to-end approval layer is now in the repository.

### Implemented behavior

- The authenticated dashboard feature-detects native `document.modelContext` support. Unsupported browsers receive no registrations and no altered UI behavior.
- `get_current_box_items` returns minimal, paginated collection context. It supports the current box, recursive descendants, and the full collection when Root plus `include_descendants` is used.
- `stage_item_edits` resolves proposed IDs against the authenticated user's collection, captures current values and `updated_at`, and opens the review dialog without writing collection data.
- `stage_wishlist_import` deduplicates the proposed checklist, previews same-name collection/wishlist matches, leaves those matches unselected by default, and opens the review dialog without creating items.
- The review dialog supports per-row selection, select all/none, editable price fields, rationales, evidence links, set-source confirmation, and explicit discard/apply actions.
- Approved item edits use `/api/items/suggestions/apply`, which validates all IDs and prices, rejects stale batches before writing, and reuses `applyItemPatch` so current-value edits append to `value_history`.
- Approved wishlist entries use `/api/wishlist/import`. Preview and apply are separate modes; apply creates only the rows selected by the user and associates them with the box that was active when the set was staged.

### Verification

- Production build passes.
- TypeScript passes.
- Targeted lint passes for all new and changed implementation files.
- Full unit suite passes: 36 test files and 137 tests.
- Full-repository lint still reports pre-existing errors in unrelated helper, auth, wishlist, and older dialog files. The new WebMCP/approval files are lint-clean.

### Next design questions

- Whether staged batches should survive refresh/navigation or remain intentionally ephemeral.
- Whether partial item-update failures should be replaced with a database RPC that commits the whole approved batch atomically.
- How to expose a visible "agent suggestions waiting" entry point if users dismiss the dialog accidentally.
- Whether rationales and evidence should become durable valuation provenance rather than review-only context.
- The first prompt/eval dataset for direct appraisal, recursive appraisal, acquisition estimation, wrong IDs, duplicate wishlist items, and ambiguous set matches.

## 2026-09-01 — Open box versus selected box

Live testing exposed two distinct dashboard scopes:

- the **open box** is the box whose contents are currently displayed (for example, `Mecha`);
- the **selected box or boxes** are cards marked through selection mode for a batch action (for example, `Gundam Built`).

The initial `get_current_box_items` contract only exposes the open box. Codex can infer the selected card through ordinary browser inspection, but that is not a reliable semantic WebMCP interface and does not provide its contents without navigating away from the current view.

The WebMCP surface should therefore be extended with explicit selection context. The preferred small change is to add a read-only `get_selected_boxes` tool that returns selected box IDs, names, paths, and selection count. A subsequent collection-context read should accept an explicit box ID obtained from that tool, while still enforcing authenticated ownership. This also supports multi-selection without overloading the meaning of “current box.”

### Live wishlist staging test

Codex successfully researched the official Tamashii Nations catalog and staged two complementary baseline METAL BUILD Evangelion units: Unit-02 and Unit-00/Unit-00 (Revised). ShrineKeep opened the approval dialog with both rows selected, official source links, no existing-name matches, and no database write before approval.

The dialog chose `Mecha` as its wishlist destination because that was the open box, even though `Gundam Built` remained selected in dashboard selection mode. This confirms that open-box and selected-box scope must be made explicit for both reads and staged-write destinations.

The first staged checklist omitted expected prices even though official Japanese MSRPs were available, because the WebMCP schema accepts an unqualified number while ShrineKeep's interface displays USD. A second pass used US specialty-retailer references and staged rounded expected budgets of $300 for Unit-02 and $280 for Unit-00/00 (Revised), excluding shipping. Future tool context should expose the collection currency explicitly, and evidence should distinguish original MSRP, current listing price, and recent sold price.

## 2026-09-01 — Concise agent copy and visible connection status

### Agent-writing contract

Agent-generated rationales should use concise, technical language. Include only information that varies per suggestion, such as price basis, condition assumption, material evidence, or the reason an item matches a set. Do not repeat generic qualifications on every row.

ShrineKeep owns the repeated disclosure and displays it once in the approval UI:

> Prices are estimates and exclude shipping unless noted. They are verified recent sold prices only when the evidence explicitly identifies sold data.

The WebMCP descriptions and rationale schemas now tell agents not to restate this disclosure. Rationale inputs are capped at 300 characters for the hackathon UI. Sources remain separate links rather than being narrated repeatedly.

### Collapsed site-tools status

The dashboard includes a compact **Site tools** panel that is collapsed by default. It distinguishes three observable states instead of claiming more than the browser API proves:

- **Registration accepted:** each `document.modelContext.registerTool(...)` promise resolved, so the page knows the browser accepted the exposed WebMCP tool definition.
- **Tool call received:** a registered `execute` handler ran, so the page knows an agent invoked a tool. The panel shows the call count and most recent call time.
- **Unavailable or failed:** `document.modelContext` was not exposed after the compatibility retry, or a registration rejected. ShrineKeep continues normally.

Registration acceptance does not prove that a particular agent inspected or understood every tool. The UI therefore says **Browser accepted** rather than **Agent connected** until an invocation is actually received.

When expanded, the panel lists the available capability categories and reminds the user that write-capable tools only stage suggestions until human approval.

## 2026-09-01 — Prompt recipes, mixed initialization, and staging inbox

This iteration replaces the one-at-a-time review flow with a route-aware staging inbox and makes the intended agent prompts visible in ShrineKeep. The newer contracts below supersede the initial `stage_wishlist_import` design.

### Persistent support copy and route-specific prompts

The collapsed WebMCP panel always shows:

> ShrineKeep has WebMCP support. Open this website on a browser an AI agent can access, and directly chat with it.

The dashboard advertises three prompt recipes:

- `Initialize a collection box for [collection name]`
- `Update valuation of items I possess in my current box`
- `Update the expected price of wishlist items in my current box`

The authenticated `/wishlist` route advertises only:

- `Update the expected price of all my wishlist items`

The global wishlist read supplies each item's associated box name so the agent can disambiguate editions and collection context.

### Two human approval boundaries

Collection initialization has two intentionally separate approvals:

1. The agent researches a set, presents the matched collection in chat, and must receive explicit user approval before calling `stage_collection_initialization` with `user_confirmed_match: true`.
2. ShrineKeep then stages the proposed box and item cards. The user chooses Owned or Wishlist per row, edits details and prices, selects rows, and explicitly approves the database write.

The Boolean confirmation is a protocol guard and an instruction to a conforming agent; the webpage cannot independently prove the content of the surrounding agent chat. The native ShrineKeep review remains the enforceable write boundary.

### Staging inbox behavior

- New stages append and do not replace older stages.
- Stages append without a fixed local count limit. The inbox is scrollable, and stages remain ephemeral browser state until reviewed, applied, discarded, or the page is refreshed.
- The inbox is a scrollable bottom-left panel and collapses to a badged stack icon, mirroring the dashboard's bottom-right selection affordance.
- Closing a review dialog preserves its stage. Only **Discard stage** or the inbox trash action removes it.
- Applying a stage removes only that stage and leaves the remainder available.
- Stages live in a provider above authenticated page content, so client-side navigation between dashboard and wishlist preserves them. Refresh persistence and durable draft history remain deferred.

### Implemented tool surface

Dashboard:

- `get_current_box_items`: possessed items only; optional recursive descendants.
- `stage_item_edits`: possessed-item valuation and acquisition estimates only; never wishlist rows.
- `stage_collection_initialization`: mixed creation stage for a new child box after chat confirmation.
- `get_current_box_wishlist_items`: wishlist rows associated with the open box only.
- `stage_wishlist_edits`: sparse name, description, tag, valuation, and expected-price stages restricted to wishlist items in that scope.

Authenticated wishlist page:

- `get_all_wishlist_items`: all wishlist rows with associated box names.
- `stage_wishlist_edits`: sparse name, description, tag, valuation, and expected-price stages across the full wishlist.

Wishlist price research defaults to a reputable current retail listing when the item is available. When retail is unavailable, out of stock, or the item is no longer produced, the agent should use a suitable reputable secondhand-market listing. Shipping is excluded. Owned-item appraisal retains the typical recent sold, second-hand, inferred-condition defaults documented above.

### Write paths

- Mixed initialization previews existing owned/wishlist name matches, creates the approved child box, and places each approved item into Owned or Wishlist according to the user's final row selection.
- Owned items use the new box as `box_id`; wishlist items use it as `wishlist_target_box_id`.
- Wishlist price approval validates ownership, wishlist status, price bounds, and `updated_at` before applying the expected-price changes.
- Agent-generated explanation remains concise and variable per row. ShrineKeep continues to own the repeated pricing disclosure in the review UI.

### Visual-language correction

The WebMCP panel should look like a native ShrineKeep information card, not a separate agent-branded surface. The implementation therefore follows the established `BoxStatsPanel` and settings-card vocabulary:

- `rounded-lg`, `border-border`, and `bg-card` for the outer panel;
- no gradients;
- existing fluid typography and `text-muted-foreground` for explanatory copy;
- `bg-light-muted` for the expanded region, with simple `rounded-md`/`bg-card` inner rows;
- theme-token colors (`primary`, `card`, `border`, `muted`) rather than hard-coded light/dark status palettes;
- restrained icon treatment and no decorative font change for prompt text.

“Stylized” in this feature means readable hierarchy, spacing, and state communication within the existing product system. It does not mean introducing a new visual identity for WebMCP.

### Verification after this iteration

- The dashboard registers five page-scoped tools in a compatible browser.
- The authenticated wishlist page registers exactly two tools.
- A live `get_all_wishlist_items` call returned the full wishlist with associated box names and the intended pricing default.
- TypeScript and the production build pass.
- Targeted lint has no errors in the changed WebMCP implementation (two existing hook-dependency warnings remain in the dashboard and wishlist clients).
- The full unit suite passes: 36 test files and 137 tests.
- Full-repository lint continues to fail on pre-existing errors outside this implementation.

## 2026-09-02 — Separate collection onboarding from existing-box amendment

Live use showed that `stage_collection_initialization` was being treated as the only way to add researched items. That made an existing collection look like a new onboarding task: the agent correctly inferred which products the user already owned, but the tool could only stage a new child box and new cards. The result was duplicate cards for possessions that already existed.

The earlier collection-init design remains valid for onboarding, but it must not be reused for amendments to an existing collection. This section narrows that contract and supersedes any broader interpretation of collection initialization above.

### Two distinct user intents

#### 1. Onboard a new collection

Use this flow when the user explicitly wants to initialize a new collection or is starting without an existing ShrineKeep box that represents it.

- The agent researches and presents the matched set in chat.
- The user approves the matched set.
- `stage_collection_initialization` stages a new child box and its proposed cards.
- The user chooses Owned or Wishlist for each row during review.
- Creating a new box is expected behavior in this flow.

The agent may not know which items a new user possesses. That uncertainty is intentional and is resolved by the user's row choices in chat or in ShrineKeep's approval UI.

#### 2. Amend the collection in the current box

Use this flow when the user is already in a box that represents their collection and asks to complete, extend, or reconcile it against a researched list.

- The agent reads both owned and wishlist items associated with the current box.
- The agent reconciles the researched list against that context and presents the inferred Owned, Wishlist, and Missing statuses in chat.
- Existing owned or wishlist items must not be staged as new cards.
- Missing entries default to Wishlist unless the user explicitly says they possess them.
- If the user says a missing entry is already possessed, stage it as a new owned card in the current box.
- New cards are added to the current box. No child box is created.
- The user can refine the inferred statuses in chat before the agent stages the final proposal.

The distinction is based on user intent and collection context, not merely whether the current box happens to contain zero items. An empty existing box may still be an amendment target, while a populated parent box may still be the location where the user explicitly wants a new child collection initialized.

### Tool-surface decision

`stage_collection_initialization` remains an onboarding-only action. Its title, description, examples, and failure guidance must say that it always proposes a new child box and must not be used to amend the contents of the current box.

Add a separate general-purpose creation action for existing boxes, tentatively named `stage_items_in_current_box`:

```json
{
  "title": "Complete the current Witch From Mercury collection",
  "items": [
    {
      "name": "Gundam Aerial",
      "status": "wishlist",
      "expected_price": 18,
      "source_urls": ["https://example.com/product"]
    },
    {
      "name": "Gundam Lfrith Ur",
      "status": "owned",
      "acquisition_price": 25,
      "source_urls": ["https://example.com/product"]
    }
  ]
}
```

The action stages new cards only. It does not create a box, move existing cards, or edit existing cards. Owned rows use the current box as `box_id`; wishlist rows use the current box as `wishlist_target_box_id`. The returned result must repeat the destination box name and the number of owned and wishlist rows staged so the scope is visible to both agent and user.

The schema should reject incompatible price fields instead of silently dropping them:

- Owned accepts `acquisition_price` and optional `current_value`, not `expected_price`.
- Wishlist accepts `expected_price`, not `acquisition_price` or `current_value`.

The agent-facing instructions must require the agent to omit any item already returned by the current-box owned or wishlist read tools. Server-side exact-name preview remains a final warning and leaves matches unselected, but approximate product identity is primarily an agent reasoning task reviewed with the user rather than a new catalog-identity subsystem.

### Ownership and wishlist reconciliation rules

For a researched set compared with an existing box:

1. Items already owned remain unchanged and are not included in the creation stage.
2. Items already on the wishlist remain unchanged and are not included in the creation stage.
3. Missing items default to Wishlist.
4. A missing item becomes Owned only after the user says they possess it or clearly approves the agent's owned inference.
5. Multiple copies are created only when the user explicitly asks for another copy.
6. Ambiguous editions or similarly named products are resolved in chat before staging.

If an item already exists on the wishlist and the user says they now own it, that is a status transition on the existing card, not creation of another card. The current general creation action should refuse that case. A separate staged “mark acquired” capability may be added later if agent-driven wishlist-to-owned transitions are needed.

### Agent-authored descriptions

Agents should not write item descriptions during either onboarding or existing-box amendment.

- New MCP-created cards use `description: null`.
- The creation schemas should omit `description` entirely so the contract is unambiguous.
- Research rationale and evidence belong in review-only fields and source links, not in the user's item description.
- The user can add personal notes and descriptions after creation through the normal ShrineKeep item editor.

This avoids repetitive boilerplate, preserves descriptions as user-authored collection context, and reduces unnecessary agent output.

### Staging timing and amendments

The preferred interaction is to finish list reconciliation in chat before creating a stage. The agent should include researched prices in that final staging call rather than first staging empty prices and then trying to patch the review.

The observed price-loss scenario still requires a regression test covering: WebMCP input → staged batch → edited or supplied price → approved request payload → persisted item. The apply API already accepts acquisition and expected prices, so the test should identify whether values were lost in transient review state or during the write path before changing the storage design.

Durable server-side stage history, catalog identifiers, and a separate checklist data model are not required for this design. Boxes remain ShrineKeep collections.

### Remaining product considerations

- Make the two prompt recipes explicit in the site-tools panel: “Initialize a new collection box…” versus “Complete the collection in my current box…”.
- Always echo the current destination box in staged-write tool results and the approval dialog.
- Decide whether the existing-box tool should be available at Root; if allowed, the result must explicitly say that cards will be unboxed/root-level.
- Preserve the current human approval boundary: no item is created until the user approves the staged rows in ShrineKeep.
- Add evaluation cases for existing owned items, existing wishlist items, chat-corrected ownership, ambiguous editions, empty existing boxes, intentional duplicate copies, and supplied retail prices.

### Implemented in this iteration

- The dashboard now exposes six tools, including the new `stage_items_in_current_box` action alongside the onboarding-only `stage_collection_initialization` action.
- Creation stages carry an explicit discriminated destination: either a new child box or the current box. The approval UI repeats that destination before the user accepts the write.
- Applying a current-box stage writes owned cards to that box and associates wishlist cards with that same box without creating another box.
- Creation schemas no longer accept descriptions, and the apply route always persists `description: null` even if an out-of-contract caller supplies text.
- Exact-name duplicate preview for current-box amendments is scoped to owned and wishlist cards associated with that box. Matches are warnings and start unselected.
- Price/status conflicts are rejected at both WebMCP staging and apply validation. Price values edited in review are mapped explicitly into the approved payload.
- Regression coverage verifies current-box and new-box destinations, owned acquisition/current values, wishlist expected values, blank descriptions, and rejection of incompatible prices.
- Root remains a valid current-box destination for now. The UI names it `Root`, and no child box is created.

## 2026-09-02 — Compact selection context tools

Users often want an agent to act on a few cards they have already selected rather than spend context reading an entire box or inspecting the visible browser. ShrineKeep now exposes selection as authoritative application state through two read-only tools:

- `get_selected_items` is available on both the dashboard and authenticated Wishlist page.
- `get_selected_boxes` is available on the dashboard, where box selection exists.

This brings the dashboard surface to eight tools and the authenticated Wishlist surface to three.

These tools read the current React selection state directly. They do not inspect the DOM, take screenshots, infer selection from visual styling, or make a database round trip. The registered WebMCP definition stays stable while its executor reads the latest rendered selection, so selecting or deselecting cards does not cause tool re-registration.

### Compact response contract

Both tools accept `offset` and `limit`, default to 25 records, and cap a response at 50 records. Responses include `selectedCount`, `returnedCount`, and `nextOffset` so an unusually large selection remains bounded and pageable.

Selected boxes expose only:

- id;
- name;
- parent box id;
- `updatedAt` version.

Selected items expose only:

- id and name;
- normalized status (`owned` or `wishlist`);
- associated box id;
- status-relevant price fields;
- `updatedAt` version.

Descriptions, photos, tags, thumbnails, acquisition dates, and full box contents are intentionally omitted. This is enough for an agent to identify the selected records and feed their IDs into existing staged edit tools without paying the token cost of full collection context.

The selected-item tool does not mutate data and does not itself authorize a later write. Existing staged-write tools and ShrineKeep's approval dialog remain the write boundary. Their descriptions now explicitly accept records returned by `get_selected_items`.

## 2026-09-02 — Judge sandbox + production first-run coach

Office-hours design (not implemented in this pass): `~/.gstack/projects/shrinekeep/salty-dev-design-20260902-judge-sandbox.md`.

Decisions:

- Judges enter through `/judge` (confirm page) then `POST /api/judge/enter`. A throwaway Supabase user is minted or resumed. TTL 24h. Start over mints a new user. Tab close does not wipe. No native `beforeunload` dialog.
- Dashboard has no sandbox chrome. TTL, Continue, and Start over live only on `/judge`. Keep this page so they can return.
- When WebMCP is ready, do not auto-seed canned demo data. When it is unsupported, keep the existing generate-demo modal. While status is still checking, show neither.
- Reuse `user_settings.dashboard_demo_prompt_dismissed` as "first-run onboarding consumed." Completing the coach, seeding demo, or confirming dismiss all set it true. It is not session-scoped. Judge reset happens because a new sandbox user starts at false.
- Coach advances on matching tool invoke, then approved apply (with created box id), then navigation into that box. `stage_collection_initialization` still requires chat confirmation before staging.

### Eng review (2026-09-02)

Scope: both layers in one PR. No Next middleware. Turnstile on `/judge`. No 15-minute cron in this PR.

- Expiry: layouts (dashboard, wishlist, settings) detect TTL and send GET session-end (callback cookie pattern) → `/judge?expired=1`. Mutating APIs 401 if sandbox expired. GET end only for expired sandbox.
- Enter: at most one expired Auth-delete. Insert `user_id` into a purge queue first. Cron (TODO) drains storage then drops the queue row.
- Coach when the three coach tools are ready. Canned demo only if WebMCP is unsupported. While `checking`, show neither; timeout fallback to canned so the UI cannot hang with neither.
- Coach reducer in `lib/webmcp/`. Coach is a sequential mode of the existing AI panel, not a floating widget. `open_box` still waits for the user to click the box (named in the panel).
- Real signed-in users hitting `/judge` are not minted over. Live sandbox: `/judge` shows Continue vs Start over (no auto-redirect). No sandbox chrome on the dashboard.
- `is_sandbox` / `sandbox_expires_at` are not client-updatable. Service-role or trigger only.
- Tests: Vitest routes + reducer. Playwright GET `/judge` only. No live mint in CI.

## 2026-09-02 — Thumbnail search for staged creation

WebMCP-created item stages now offer a batch-level option labeled “Use first image found based on item title to set as thumbnail.” It is enabled by default and runs only after the user approves the selected rows.

The approval path reuses the authenticated `/api/images/search` endpoint used by the regular item image picker. Searches run with bounded concurrency, and the first valid HTTP(S) result is sent through the normal item `photos` contract with `is_thumbnail: true`. The staged creation API validates those photo URLs, derives `thumbnail_url` from the selected photo, and passes both values to the existing `createItems` persistence path.

Image search remains optional infrastructure. A missing provider key, an empty result, or an individual search failure leaves that item image-less without blocking the approved item batch. Users can also turn the option off before approval.

## 2026-09-02 — Intent-first tool routing and optional new-item pricing

A live collection-initialization chat exposed unnecessary discovery behavior: before researching or staging the new box, the agent called `get_selected_boxes` to learn the destination. Box selection was irrelevant because `stage_collection_initialization` always creates a child of the currently open box. The read was harmless but added latency and suggested that the tool surface did not communicate its workflow clearly enough.

### Tool-contract decisions

- Tool descriptions should route by user intent and state both positive and negative preconditions, rather than relying on declaration order or expecting the agent to infer a workflow from tool names.
- `get_selected_boxes` and `get_selected_items` are targeted batch-action tools. Their descriptions should say to call them only when the user explicitly refers to selected cards/boxes or asks to act on the current UI selection. They are not general page-context or collection-initialization prerequisites.
- `stage_collection_initialization` should state that it uses the currently open box as its parent, that UI-selected boxes and items do not affect the destination, and that no selection read is required first.
- The initialization description should expose the current parent name dynamically where practical, for example: “Creates a child under the open box: Root.” This gives the agent the relevant scope without another tool call. The staged result and approval UI must continue to echo the destination.
- Tool declaration order is not a routing mechanism. Evaluation should assume an agent may inspect or choose tools in any order.

### Approval and price-research decision

Whenever the agent presents new cards for staging, it should also offer optional price research in the same message. This applies to both `stage_collection_initialization` and `stage_items_in_current_box`, including the “Complete the collection in my current box” workflow. The choice must be unambiguous:

- `Approve list only`
- `Approve + research prices`

A bare “yes” should approve the displayed list only unless the user has separately requested prices. Price research is offered by default but is not performed by default, avoiding a potentially slow marketplace search the user did not request. If the user's original request already asks for researched prices, do not ask again.

If the user chooses price research, the agent should complete it before making the single staging call and include concise rationale/source links for each researched row. Field and evidence semantics follow the proposed item status:

- Wishlist rows receive `expected_price`, based on current reputable USD retail price, shipping excluded. When retail is unavailable or the product is out of production, use a reputable secondhand-market price and identify that basis.
- Owned rows may receive an estimated `acquisition_price`. This is an agent estimate of likely original retail or historical market price, not a claim about what the user actually paid. The review UI must make the estimate editable before approval.
- Owned rows may also receive `current_value` when the task includes current valuation and suitable evidence is available. Current value follows the existing typical recent second-hand sold-price basis rather than reusing the acquisition estimate.

Price research is therefore a shared behavior of both new-item staging tools, not an initialization-only feature. `stage_items_in_current_box` still requires reconciliation first: read the current box's owned and wishlist cards, compare them with the researched collection, and stage only genuinely missing rows without creating another box.

### Follow-up implementation and evaluation

- Tighten the three affected tool descriptions and add contract tests for their routing language.
- Update both visible new-collection prompt recipes to teach the two approval replies: “Initialize a new collection box…” and “Complete the collection in my current box…”.
- Preserve a researched retail estimate when a user changes a staged initialization row between Wishlist and Owned. The current review model stores status-specific fields, so simply hiding the incompatible field would lose the useful estimate. Prefer a status-neutral staged retail estimate that can seed `expected_price` or estimated `acquisition_price` over weakening the canonical status/price validation.
- Add an agent evaluation where “Set up a new box for …” must not call either selection tool, while “Update the selected items” must prefer `get_selected_items`.
- Add initialization and current-box-completion evaluations for list-only approval, price-enabled approval, a bare “yes,” out-of-production items, mixed Owned/Wishlist choices, estimated acquisition price, and omission of existing cards.

### MCP context implemented

- Selection-tool titles and descriptions now identify them as explicit-selection-only reads and warn against using them for initialization, full-box completion, or destination discovery.
- Both new-item staging descriptions now name the current open-box destination, distinguish new-child initialization from current-box completion, teach the two approval replies, and define status-specific price research behavior.
- Current-box completion explicitly requires both owned and wishlist reads plus reconciliation before staging only missing cards.
- New-item schemas now describe estimated acquisition price, wishlist expected price, owned current value, rationale, and status defaults at the individual field level.
- The Site tools prompt recipes now advertise the approval and optional-price workflow.
- Focused contract tests cover selection routing, destination disclosure, approval choices, price fields, and current-box reconciliation language.

## 2026-09-02 — Remove the local staging count limit

Live testing filled the staging inbox with five one-item stages and confirmed that a sixth WebMCP call failed with a `5/5` capacity error. The fixed limit did not protect durable storage or an external service: stages are local, ephemeral browser state, and the inbox already has a bounded-height scroll container.

The five-stage cap is removed. New stages continue to append, the header reports only the number waiting, and the scrollable inbox remains the mechanism for handling a long queue. Existing explicit discard/apply behavior and refresh-ephemeral lifetime are unchanged.

## 2026-09-02 — Align staging inbox with selection controls

Live UI testing found that the staging inbox moved to `5.75rem` (92px) from the viewport bottom while the dashboard Select control moved to 72px when the bottom selection action bar appeared. The extra 20px made the two floating controls visibly inconsistent.

Both controls now use one shared bottom-offset function: 24px normally and 72px while the selection action bar is visible. This makes the collapsed inbox button and expanded inbox panel replicate the Select control's vertical behavior and prevents their offsets from drifting independently.

## 2026-09-02 — Align floating-control visual treatment

The collapsed staging control keeps its distinct primary color and stage-count badge, but now follows the dashboard Select control's container treatment. It uses the theme's `rounded-2xl` radius instead of a circle, 90% resting opacity with full opacity on hover, backdrop blur, the same border token, and matching hover scale/shadow transitions. This preserves functional distinction without making the two peer controls look like unrelated component systems.

## 2026-09-02 — Opt-in pricing evidence in descriptions

Repeated pricing research can cost tokens and confuse similar editions. Both creation tools now offer three chat approval choices before staging:

- A: Approve list only.
- B: Approve list and research prices for each item.
- C: Approve list, research prices, and attach evidence of researched price to description.

C is recommended for more reliable future valuations, since the agent can reuse item details and links. A bare approval means list only unless prices were already requested. C or an equivalent explicit request is required to set `attach_price_evidence`; A/B leave descriptions blank, with B retaining evidence in review. This supersedes the earlier blanket ban on creation descriptions. Staging and apply validate the opt-in, and C descriptions can be edited or cleared in the existing review dialog before saving.

Evidence notes stay compact: verified variant, researched price and basis, date checked, and supporting URL. Missing evidence is not a reason to invent a price. Later research checks relevant description links first and broadens its search when a page is inaccessible, stale, or mismatched. Retail, acquisition estimates, and secondhand sold valuations keep their separate meanings. A valuation request alone does not authorize changing descriptions or personal notes.

Read tools default to a 300-character preview, a truncation indicator, and complete deduplicated HTTP(S) links extracted before shortening the text. `include_full_description` returns full notes when needed. Internal edit staging also loads full notes so the review does not lose existing text.

Using descriptions is a hackathon compromise: users also write personal notes there. Planned dedicated metadata will separate identifiers, variant details, research information, and evidence links from those notes. This iteration adds no metadata table or migration. The project story records that future work in a short paragraph in its existing casual builder voice.

## 2026-09-02 — Product identifiers and shorter creation descriptions

Automatic thumbnail searches use item names. Both creation tools now guide agents to include a short verified maker, brand, product line, or variant identifier in every owned or wishlist product name when needed for an unambiguous match: `YouTooz Astarion vinyl figure`, for example. Identifiers in the box name or description alone are insufficient.

This supersedes the earlier instruction to put prices, research notes, and dates in creation descriptions. Item-focused prose should be at most 100 characters; explicitly requested evidence links (including option C) go on separate lines as bare URLs, excluded from that prose limit. Prices and price bases belong in their dedicated fields and rationale, with evidence in `source_urls`. Shared guidance appears in both creation-tool descriptions and their name/description schemas. This is agent guidance; existing storage limits and description opt-in behavior remain in place.
