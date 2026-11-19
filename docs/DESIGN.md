# Design System — ShrineKeep

ShrineKeep does not have one visual brand inside the app. Users do.

The product owns **structure, roles, and named tokens**. Each account owns **values**: colors, heading/body fonts, border radius, and outline style. Two users can look unrelated and still share the same layout, components, and CSS variable names.

If a screen only looks correct on the default light theme, it is wrong.

## Product Context

- **What this is:** A collection manager for items, nested boxes, value/spending, and wishlist progress. Tagline: "Consumerism has never been this organized."
- **Who it's for:** Collectors who want a dense, customizable workspace, not a generic inventory spreadsheet.
- **Space/industry:** Personal collection / consumer tracking web app.
- **Project type:** Authenticated dashboard web app (shadcn/ui + Tailwind) plus a public marketing/auth shell and optional shared wishlists.

Live product: [shrinekeep.com](https://www.shrinekeep.com)

## Aesthetic Direction

- **Direction:** User-themed industrial workspace, with a separate marketing voice on `/landing`.
- **Decoration level:** Minimal in-app. Type, surfaces, borders, and data color do the work. No decorative blobs, purple gradients, or one-off hex palettes.
- **Mood (app):** Dense, organized, personal. The shrine should feel like *theirs*.
- **Mood (marketing):** Editorial mixed-type poster. Landing is allowed to be louder than the app because it is not user-themed.
- **Reference implementation:** `lib/theme-colors.ts`, `lib/settings.ts` (`applyColorScheme`), `components/theme-provider.tsx`, `components/settings/theme-editor.tsx`, `app/globals.css`, `tailwind.config.ts`.

### Two faces

| Surface | Theme source | Look |
|---|---|---|
| `/dashboard`, `/settings`, `/wishlist` (owned), `/social` | User `color_scheme` + fonts from `/api/colors` | Fully custom |
| `/wishlist/[token]` (public share) | Owner theme when the owner shares their style (`profile_share_style`, the same switch public profiles use) | Owner's shrine, or defaults |
| `/landing`, `/`, `/auth/*`, `/legal/*` | Built-in `:root` defaults only | Product marketing / auth |

`ThemeProvider` clears the document's theme variables and fonts on marketing/auth/legal routes and on shared wishlists, so a logged-in user's shrine (or an unsaved Settings preview) does not leak onto Sign Up or onto someone else's wishlist. A shared wishlist applies the owner's style to its own subtree (`PublicTheme`), never to the document.

## The rule that matters

**Paint with names, never with hex (or Tailwind palette colors) in product UI.**

- Use semantic Tailwind colors: `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, `bg-destructive`, `text-muted-foreground`, `bg-light-muted`, `ring-primary`, `ring-selectable-hover-ring`.
- Use CSS variables for anything Tailwind does not wrap: `hsl(var(--value-color))`, `hsl(var(--tag-red))`, `var(--radius)`, `var(--font-heading)`, `var(--font-sans)`.
- Borders and shadows of surfaces and controls come from the outline classes (`sk-outline`, `sk-raised`, ...), not from raw `border` / `shadow-*`. See [Outline](#outline).
- Helpers: `getTagChipStyle()` / `getTagForeground()` in `lib/utils.ts` for tag chips. `SELECTION_RING_CLASS` / `FOCUS_RING_CLASS` / `getSelectableRingClasses()` for selection and focus.
- **Do not** use `bg-green-50`, `text-blue-600`, `#1a1f2e`, `rgb()`, or hardcoded `hsl(...)` in components that render under a user theme.
- **Do not** invent a new color for one screen. If the role does not exist, add it to the registry (see below) so every theme, including imports/exports, gets it.

Default light/dark values in `THEME_COLOR_REGISTRY` are **seeds**, not the brand. Pink Mode, Matcha and Arcade exist to prove the same structure can look like a different product.

## Color

- **Approach:** Named roles. Values are user-chosen HSL triples stored as `"H S% L%"` (no `hsl()` wrapper) so CSS can do `hsl(var(--token))` and opacity modifiers like `bg-primary/90`.
- **Canonical source:** `THEME_COLOR_REGISTRY` in `lib/theme-colors.ts`. Keys match `Theme` in `lib/types.ts`. CSS names are kebab-case (`cardForeground` → `--card-foreground`).
- **Tailwind bridge:** `tailwind.config.ts` maps shadcn tokens to `hsl(var(--...))`. Product-only tokens (value, graph, thumbnail, tags) are usually used as CSS variables directly.
- **Presets:** Light, Dark, Pink, Matcha, Arcade, Custom (`COLOR_SCHEME_PRESETS` in `lib/settings.ts`; schemes in `lib/theme-colors.ts`). Custom is any saved `user_settings.color_scheme`. A preset is a whole look: colors, `radius` and `outline` in its scheme, plus optional heading/body fonts. Apply one through `resolveThemePreset()`, which fills in default fonts. Every built-in preset is `outline: "soft"`; a theme with the hard outline is always Custom (`detectThemePreset()`), and a preset saved before the field existed still reads as that preset. Light, Dark and Pink use the defaults; Matcha is Lora + Figtree at `0.25rem`, Arcade is JetBrains Mono at `0`. The landing demo lists these same presets, so adding one here adds it there.
- **One definition of valid:** `sanitizeTheme()` in `lib/theme-colors.ts`. It rebuilds a theme from the registry's color keys (each an HSL triple matching `HSL_TRIPLE_PATTERN`: no `hsl()` wrapper, commas or alpha), a radius from `THEME_RADIUS_OPTIONS`, and an outline of `"soft"` or `"hard"`, and drops everything else. `PUT /api/settings`, every read of a stored theme (`normalizeStoredTheme()`), theme import, and the public-profile sanitiser (`parseStyle()` in `lib/sharing/server/read-core.ts`) all go through it.
- **Import/export:** JSON of color keys + `radius` + `outline` + `header_font_family` + `body_font_family`. Exports always write `outline`. An import unwraps `hsl(h, s%, l%)` to the stored triple and ignores any value `sanitizeTheme()` rejects. A theme file is a whole look: what it leaves out comes from the defaults (`mergeColorScheme()`), so a file without an outline imports as soft and one without a radius as `0.5rem`; only fonts it does not name are kept. Chart overlay is **not** part of a theme file.

### Token catalog

Editor groups match Settings → Theme.

#### Page & surfaces

| Theme key | CSS variable | Tailwind | Role |
|---|---|---|---|
| `background` | `--background` | `background` | Page canvas |
| `foreground` | `--foreground` | `foreground` | Default text |
| `card` | `--card` | `card` | Cards, raised panels |
| `cardForeground` | `--card-foreground` | `card-foreground` | Text on cards |
| `popover` | `--popover` | `popover` | Menus, dropdowns, dialogs |
| `popoverForeground` | `--popover-foreground` | `popover-foreground` | Text in popovers |
| `lightMuted` | `--light-muted` | `light-muted` | Subtle solid panels (no opacity wash) |

#### Buttons & actions

| Theme key | CSS variable | Tailwind | Role |
|---|---|---|---|
| `primary` | `--primary` | `primary` | Primary actions (Save), selection ring |
| `primaryForeground` | `--primary-foreground` | `primary-foreground` | Text/icons on primary |
| `secondary` | `--secondary` | `secondary` | Secondary fills |
| `secondaryForeground` | `--secondary-foreground` | `secondary-foreground` | Text on secondary |
| `muted` | `--muted` | `muted` | Quiet fills, disabled-adjacent chrome |
| `mutedForeground` | `--muted-foreground` | `muted-foreground` | Secondary text, hints |
| `accent` | `--accent` | `accent` | Hover/highlight wash |
| `accentForeground` | `--accent-foreground` | `accent-foreground` | Text on accent |

#### Borders & focus

| Theme key | CSS variable | Tailwind | Role |
|---|---|---|---|
| `border` | `--border` | `border` | Default borders |
| `input` | `--input` | `input` | Input borders |
| `ring` | `--ring` | `ring` | Focus ring (buttons use `ring-ring`) |
| `selectableHoverRing` | `--selectable-hover-ring` | `selectable-hover-ring` | Light hover ring in selection mode |

#### Destructive

| Theme key | CSS variable | Tailwind | Role |
|---|---|---|---|
| `destructive` | `--destructive` | `destructive` | Delete, errors, danger |
| `destructiveForeground` | `--destructive-foreground` | `destructive-foreground` | Text on destructive |

#### Values & data

| Theme key | CSS variable | Role |
|---|---|---|
| `valueColor` | `--value-color` | Current item/collection value |
| `acquisitionColor` | `--acquisition-color` | Acquisition / spend |

These are **meaning colors**, not decoration. Value and spend must stay distinguishable in every theme.

#### Graph

| Theme key | CSS variable | Role |
|---|---|---|
| `graphValueColor` | `--graph-value-color` | Value series |
| `graphAcquisitionColor` | `--graph-acquisition-color` | Acquisition series |
| `graphAxisColor` | `--graph-axis-color` | Axes and tick labels |
| `graphGridColor` | `--graph-grid-color` | Grid lines |
| `graphTooltipBackground` | `--graph-tooltip-background` | Tooltip fill |
| `graphTooltipForeground` | `--graph-tooltip-foreground` | Tooltip text |

#### Thumbnail

| Theme key | CSS variable | Role |
|---|---|---|
| `thumbnailColor` | `--thumbnail-color` | Thumbnail fill, star/badge background |
| `thumbnailForeground` | `--thumbnail-foreground` | Thumbnail text and icons |
| `thumbnailHighlight` | `--thumbnail-highlight` | Overlay hover background |
| `thumbnailHover` | `--thumbnail-hover` | Overlay hover icon color |

#### Tags

Tag **identity** is a named slot (`red` … `violet`). The **hue is user-editable**. Chip text is one shared token.

| Theme key | CSS variable | Slot |
|---|---|---|
| `tagRed` | `--tag-red` | `red` |
| `tagOrange` | `--tag-orange` | `orange` |
| `tagYellow` | `--tag-yellow` | `yellow` |
| `tagGreen` | `--tag-green` | `green` |
| `tagBlue` | `--tag-blue` | `blue` |
| `tagIndigo` | `--tag-indigo` | `indigo` |
| `tagViolet` | `--tag-violet` | `violet` |
| `tagForeground` | `--tag-foreground` | Text inside every chip |

`TAG_COLORS` in `lib/types.ts` is the slot list. Rainbow sort order follows that array.

### Default seeds (not the brand)

Light and dark HSL seeds live on `:root` / `.dark` in `app/globals.css` and in `THEME_COLOR_REGISTRY`. They exist so unthemed routes and missing keys still render. Merge behavior: `mergeColorScheme()` fills gaps from the light default.

The document itself is always light: `app/layout.tsx` runs next-themes with `attribute="class"`, `defaultTheme="light"` and no system theme, so `<html>` carries the class `light` and `color-scheme: light` whatever the visitor's OS prefers. `.dark` and `dark:` utilities never apply; a dark look is a user theme, not a mode.

### Adding a color

1. Add the key to `Theme` in `lib/types.ts`.
2. Add a `THEME_COLOR_REGISTRY` entry (label + light/dark defaults).
3. Put the key in the right `THEME_EDITOR_GROUPS` group.
4. Add `:root` and `.dark` in `app/globals.css`.
5. If it is a shadcn-style token, add it to `tailwind.config.ts`.
6. Use only the named token in UI.

Skip a step and imported themes, the editor, or dark fallback will drift.

### Adding a non-color field

`radius` and `outline` are the precedents. A non-color field is a key on `Theme` that is not in `THEME_COLOR_REGISTRY`.

1. Add the key to `Theme` in `lib/types.ts` and exclude it from `ThemeColorKey` in `lib/theme-colors.ts`.
2. Give it a default that reproduces the look before the field existed, and normalize on read (`normalizeStoredTheme()` for a stored theme, `mergeColorScheme()` for any partial one), so saved themes without it do not change.
3. Emit its CSS variables from `applyColorScheme()` for **every** theme. `ThemeProvider`, the settings preview, public pages and the landing mock all set and clear variables by the keys that function returns.
4. Validate it in `sanitizeTheme()`. It is stored inside the `user_settings.color_scheme` JSON, and that function is the only gate for saves, stored reads, imports and public pages: a field it does not copy is never stored or shown.
5. Write it in `buildThemeExport()`.
6. Compare it in `detectThemePreset()` and set it in `resolveThemePreset()`.
7. Add the control in `components/settings/theme-editor.tsx`; changing it sets the preset to Custom.

## Typography

Fonts are **user settings**, not a single product typeface.

- **Heading:** `--font-heading` ← `user_settings.header_font_family`
- **Body / UI:** `--font-sans` ← `user_settings.body_font_family`
- **Default both:** Inter (`DEFAULT_HEADER_FONT_FAMILY` / `DEFAULT_BODY_FONT_FAMILY` in `lib/fonts.ts`)
- **Loading:** `next/font` (and Geist) variables on `<html>` in `app/layout.tsx`. All catalog fonts are loaded so theme preview does not flash.
- **CSS stacks:** `FONT_FAMILY_CSS` in `lib/fonts.ts`
- **Apply in CSS:** `body` uses `--font-sans`. `h1–h6` use `font-heading`.

### Catalog (`FONT_OPTIONS`)

Sans: Inter, Geist, Noto Sans, Nunito Sans, Figtree, Roboto, Raleway, DM Sans, Public Sans, Outfit, Bebas Neue  
Mono: Geist Mono, JetBrains Mono  
Serif: Lora, Merriweather, Playfair Display, Source Serif 4, Times New Roman  
Expressive (intentional, user-opt-in): Comic Sans, Papyrus

Do not shrink this list in UI work because a font is "overused" or "ugly." The editor is the point. Do not add a font without `FONT_OPTIONS`, `FONT_FAMILY_CSS`, and a `next/font` (or system) stack in `app/layout.tsx`.

### Scale (app)

Use fluid utilities from `app/globals.css` so type survives small viewports:

| Class | Clamp |
|---|---|
| `text-fluid-xs` | 0.625rem → 0.75rem |
| `text-fluid-sm` | 0.7rem → 0.875rem |
| `text-fluid-base` | 0.8125rem → 1rem |
| `text-fluid-lg` | 0.875rem → 1.125rem |
| `text-fluid-xl` | 1rem → 1.25rem |
| `text-fluid-2xl` | 1.125rem → 1.5rem |
| `text-fluid-3xl` | 1.25rem → 1.875rem |

Prefer `text-fluid-*` in dashboard/settings/wishlist/social chrome. Fixed `text-sm` / `text-lg` is fine for tight controls (buttons, inputs) that already have fixed heights.

### Marketing exception

`/landing` may set display fonts per word (Bebas Neue, Playfair, Roboto, Merriweather, etc.). That is the product poster, not the in-app system. Do not copy that mixed-font trick into dashboard components.

The motto ("Consumerism has never been this organized.") is always set in mixed faces. Its fit table lives in `lib/landing/motto.ts`, which also fixes each line's height so a font shuffle cannot change the poster's size; true italic cuts for it are loaded only on the route (`app/landing/fonts.ts`).

### Landing kit

Landing-only pieces live in `components/landing/`. The page is louder than the app but still paints with tokens: hard `border-foreground` rules, offset `foreground` shadows, tag colours as flat fills.

- `hero-motto.tsx`: the poster. Words and shelf figures load scattered and settle into place.
- The Keepers: nine token-coloured SVG figures on the hero shelf and in the game. They live in `components/keeper.tsx`, outside this folder, because the app's empty states use them too (see [Collection cards](#collection-cards)).
- `mock-dashboard.tsx`: a working miniature of the dashboard, client state only. Its theme switcher scopes `applyColorScheme()` output to the mock's own wrapper, so the page around it stays on built-in defaults. It follows the dashboard's model: an item lives in one box or the root, and items and boxes are dragged onto box cards, the move-to-parent zone, or breadcrumbs (same sensors and collision detection as `use-dashboard-dnd.ts`). Draggables use `touch-action: manipulation`, not `none`, so the landing page still scrolls under a finger.
- `blind-box-game.tsx`: the capsule-machine game. Pretend money only.
- `lib/landing/`: the pure rules behind those components, with tests: the motto's fit (`motto.ts`), the game's draws, trades, odds and figure values (`blind-box.ts`), the mock's tree and drop rules (`mock-dashboard.ts`), and the shared font stacks and shadow (`tokens.ts`). The odds line on the page is derived from the weights there.

## Spacing

- **Base unit:** 4px (Tailwind default). Common steps: 1, 2, 3, 4, 6, 8 (4/8/12/16/24/32px).
- **Density:** Dense. Collection grids, filters, and graphs need information density. Do not "spacious-redesign" the dashboard. How tightly the cards themselves are packed is a per-device choice, see [Collection cards](#collection-cards).
- **Container:** `container` centered, `padding: 2rem`, max `2xl: 1400px` (`tailwind.config.ts`).
- **Layout helpers:** `layout-shrink-visible` (flex/grid children that must shrink without clipping vertically), `truncate-line` (ellipsis without killing vertical overflow), `item-card-no-select` (selection mode vs text selection).

## Layout

- **Approach:** Grid-disciplined app. Marketing can be more editorial.
- **App chrome:** `min-h-screen bg-background`, `AppNav` on authenticated routes, content in container/padded columns.
- **Cards:** `bg-card text-card-foreground`, radius from `--radius`, border and shadow from the outline classes (`sk-outline sk-raised`). Use `Card` rather than rebuilding it.
- **Selection:** Primary ring when selected or drop-target; `--selectable-hover-ring` on hover in selection mode. Offset fill uses `ring-offset-background` so the hole matches the page, not a hardcoded white.
- **Min width:** Landing and several app shells use `min-w-[360px]` to avoid crushed controls.

### Layout stability

Content arriving must not move content that is already on screen. A page that jumps while it loads (layout thrash) reads as broken and makes people miss what they were about to click. Rules for product surfaces:

- **One render path.** Loading and loaded states render the same blocks in the same order. Do not swap in a simplified "loading" tree that leaves blocks out; a block that is missing while loading pushes everything down when it appears.
- **Anything conditional on data keeps its place.** If a block depends on what a request returns (a tag strip, a drop zone, a row of tabs), either show it from the first frame or give it a slot whose size does not depend on the answer. The move-to-parent zone is on screen in every box before the box has loaded; only its label changes.
- **Skeletons are the size of what replaces them.** A grid that knows how many cards are coming shows that many skeleton cards (`expectedCount` on `BoxGrid` and `ItemGrid`, `takeLoadingFixtures()` in `lib/card-density.ts`): the whole box tree arrives with every folder load, so a box's child count is known before it is opened, and a refetch knows the count already on screen. A count of 0 shows the empty state straight away. Only a genuinely unknown count falls back to one row.
- **Late details load into reserved rows.** Sparklines, counts and similar extras get a fixed-height row whether or not there is anything to draw.
- **One line, then scroll.** A strip whose length depends on data (tag chips) stays on one line at a fixed height and scrolls sideways (`sk-scroll-x`). It never wraps onto a second line.
- **Fade, do not pop.** Content that replaces a skeleton takes `sk-fade-in` (see [Motion](#motion)). Opacity only: an entrance never translates, scales or resizes.

Known exceptions: a box opened for the first time has no item count, so its item grid starts as one row; and below `md` the item header wraps when a box turns out to have wishlist tabs.

## Collection cards

Item and box cards (`components/item-card.tsx`, `components/box-card.tsx`) and the grids that hold them.

- **Card density:** `comfortable` or `compact`. Comfortable is the original layout and the default. It is a per-device preference in localStorage (`shrinekeep:card-density`), not a theme field and not in `user_settings`: a phone and a desktop can differ. `useCardDensity()` (`lib/hooks/use-card-density.ts`) is the one source of truth; the server and the hydration render are always comfortable. `CardDensityToggle` sits in the dashboard toolbar and on the owner wishlist page. `ItemGrid`, `BoxGrid` and search results follow it and pass cards a `density` prop. Public pages and the wishlist's guest preview stay comfortable.
- **What compact changes:** column counts, minimum heights and sparkline heights per density are in `lib/card-density.ts`. Do not hardcode them in a grid.

  | | Comfortable | Compact |
  |---|---|---|
  | Item grid columns (base / sm / md / lg / xl) | 1 / 1 / 2 / 3 / 4 | 2 / 3 / 4 / 5 / 6 |
  | Box grid columns | 1 / 1 / 2 / 3 / 4 | 2 / 2 / 3 / 4 / 5 |
  | Item card | 192px thumbnail, `p-6`, description, min 424px (wishlist 450px) | 96px thumbnail, `p-3`, no description, min 230px (wishlist 252px) |
  | Box card | actions beside the name, description, min 152px | name on its own row, actions beside the item count, no description, min 118px |

  Compact keeps the fluid type sizes. A figure is never cut there: the label of a "Label: figure" row gives way first (`CardStatLine`).
- **Box sparklines:** on the owner's dashboard each box card ends with a `BoxSparkline` of value (solid, `--graph-value-color`) and cost (dashed, `--graph-acquisition-color`), 32px comfortable and 24px compact, which adds 40px or 30px to the card's minimum height. It adds no visible numbers or labels. The card shows no figures of its own, so the sparkline is an image named with them (`role="img"`, "Value $X, cost $Y over time"); the empty row kept for a box with no history is `aria-hidden`. `BoxGrid` fetches every visible box in one request (`useBoxSparklines`) and refetches with the stats panel. The row is kept, empty, for a box with no history, so a row of cards stays one height. Public and showcase cards have no sparkline row.
- **Keepers and placeholders:** `components/keeper.tsx` is a product asset: empty states show one `aria-hidden` Keeper above the message via `components/empty-state.tsx` (one figure per place, 64 to 80px, no animation), and that is the only in-app decoration. A no-photo item tile is washed in the item's first tag colour (`hsl(var(--tag-<slot>) / 0.16)`, icon in the full colour, via `lib/placeholder-tint.ts`); untagged items and surfaces that hide tags keep `bg-muted`.
- **Keyboard:** item and box cards are buttons (`Selectable`): a tab stop with a focus-visible ring, and Enter or Space does what a click does. Focus from a pointer click is dropped, so a clicked card never keeps a ring. Dragging has no keyboard equivalent.
- **Dragging:** draggable cards show a grab cursor (`cursor-grab`, `cursor-grabbing` while held), not the pointer. While a drag is in progress every place that would accept it advertises itself with a dashed `primary/60` edge: box cards (outline, same footprint as the selection ring), breadcrumbs, and the move-to-parent zone, which names the box it moves to. The solid primary ring or fill replaces the cue on the target under the pointer. The box being dragged and, for box drags, the rest of the selection show no cue (`lib/dashboard-drop-targets.ts`).
- **Tag quick-filter:** `components/tag-quick-filter.tsx` is one line of chips in the item grid's header, one per tag carried by the items in view. From `md` up it sits between the title or tabs and the add button and takes the free width of that row; below `md` it is a line of its own under them. It never wraps: too many chips scroll sideways. An account with tags always has the line, so it says "None in this view" below `md` rather than disappearing (from `md` up an empty strip is just blank); an account with no tags has no line. A chip toggles that tag in the same include-tags filter the Filters panel edits (`aria-pressed`). Chips are painted with the `--tag-<slot>` tokens; once one is picked the others step back.

## Radius

`--radius` is a theme field (`Theme.radius`), default `0.5rem` (`DEFAULT_THEME_RADIUS`).

Editor options (`THEME_RADIUS_OPTIONS`): None `0`, Small `0.25rem`, Medium `0.5rem`, Large `0.75rem`. These four are the only radii a theme can carry; any other value is dropped on save, on read and on import.

A saved radius lives in two places, for history: the `user_settings.border_radius` column and `color_scheme.radius`. Saving a theme writes both. Reads take the column, then the theme's value, then the default (`normalizeStoredTheme()`).

Tailwind: `rounded-lg` → `var(--radius)`, `rounded-md` → `calc(var(--radius) - 2px)`, `rounded-sm` → `calc(var(--radius) - 4px)`.

Prefer `rounded-md` / `rounded-lg` so user roundedness actually changes the UI. Hardcoded `rounded-2xl` / `rounded-full` is only for controls that must stay pill-shaped regardless of theme (document why if you add one).

## Outline

The outline style is a theme field (`Theme.outline`), `"soft"` or `"hard"`, default `"soft"`. Missing or unknown means soft. It is stored inside the `color_scheme` JSON, next to the colors.

- **Soft:** the original look. 1px borders in `--border` / `--input`, Tailwind's blurred shadows.
- **Hard:** the landing poster's look, in the user's colors. Every border and divider is the same 2px line in `--foreground`: cards, buttons, inputs, selects, dialogs, menus, the panels they sit on, and the rules between sections. Objects (cards, dialogs, menus, floating controls, and primary, destructive and outline buttons) get a solid `4px 4px` offset shadow in `--foreground`, no blur. Panels and bars stay flat.

Three things make hard read as one system instead of ink drawn over a soft page, and they are why it works on the landing poster:

1. **One line.** No grey hairline sits next to an ink line. Panels use `sk-outline`, dividers use `sk-rule-*`.
2. **Backdrops are flat.** Only objects are raised. A panel that holds cards is ruled, never lifted, and loses any soft shadow it had (`sk-flat-*`).
3. **One raised level.** Inside a raised surface nothing else is raised: a button in a card, or a card in a dialog, is outlined but flat.

Editor options: Soft, Hard (Settings → Theme → Outline, under Roundedness).

`applyColorScheme()` drives four CSS variables (`getThemeOutlineCssVars()` in `lib/theme-colors.ts`):

| CSS variable | Hard | Soft |
|---|---|---|
| `--outline-width` | `2px` | undefined |
| `--outline-color` | `hsl(var(--foreground))` | undefined |
| `--outline-shadow` | `4px 4px 0 0 hsl(var(--foreground))` | undefined |
| `--outline-flat` | `0 0 #0000` | undefined |

Soft sets each one to `initial`, which un-defines a custom property. Nothing is declared on `:root`, so unthemed routes are soft, and a soft subtree inside a hard page (the Reset to Light Mode button, an owner's public theme) stays soft. Components do not read the variables themselves (no `var(--outline-*)` in a class name or inline style). They are consumed through component-layer classes in `app/globals.css`, each with the soft value as its fallback:

| Class | Soft fallback | Used by |
|---|---|---|
| `sk-outline` | 1px `--border` | `Card`, `DialogContent`, `SelectContent`, dropdown and context menus, color picker popover; every hand-built panel and bordered box (section panels, stats and AI panels, list boxes, thumbnails) |
| `sk-outline-control` | 1px `--input` | `Input`, `Textarea`, `SelectTrigger`, outline `Button` |
| `sk-outline-faint`, `sk-outline-muted` | 1px `--border` at 50%; 1px `--muted` | surfaces whose soft border is quieter than `--border` (chart tooltip; the profit tile in box stats) |
| `sk-outline-filled` | no border | primary, destructive and secondary `Button` |
| `sk-raised`, `sk-raised-md`, `sk-raised-lg`, `sk-raised-xl` | Tailwind `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl` | `Card`; menus and `SelectContent`; `DialogContent`, context submenu, color picker popover; chart tooltip |
| `sk-btn`, `sk-btn-raised` | flat, `shadow-sm` on hover when motion is allowed | every `Button`; raised on primary, destructive and outline. Hard: the raised variants keep the offset shadow on hover, the others stay flat |
| `sk-rule-t`, `sk-rule-b` | 1px `--border` on that side | nav bars, panel headers and footers, section dividers (instead of `border-t` / `border-b`) |
| `sk-flat-sm`, `sk-flat-bar` | `shadow-sm`; the selection bar's upward shadow (`--foreground` at 8%) | in-flow panels and bars that have a faint shadow when soft; none when hard |
| `sk-raised-hover-xl` | `shadow-xl` on hover | floating controls whose soft shadow grows on hover |
| `sk-card-hover` | no shadow, `shadow-lg` on hover when motion is allowed | the wrapper around item and box cards (`CARD_HOVER_MOTION_CLASS`) |
| `sk-ring-selected`, `sk-ring-hover` | nothing (zero-width outline) | `Selectable`, next to its selection and hover rings |

Which class wins is decided in the stylesheet, not by `cn()`: `tailwind-merge` does not know these classes and keeps all of them. Two properties of that block do the work, and `lib/theme-outline-css.test.ts` pins both:

- **Every selector is a single class**, with states inside `:where()` (`.sk-btn:where(:hover)`). A Tailwind utility on the same element therefore always wins, at rest and on hover.
- **Primitive defaults come first.** The classes only a primitive sets for itself (`sk-btn`, `sk-btn-raised`, `sk-outline-filled`, `sk-card-hover`, with their hover rules) are declared above the classes a caller can pass (`sk-outline*`, `sk-rule-*`, `sk-raised*`, `sk-flat-*`, `sk-raised-hover-xl`). So `<Button className="sk-outline sk-raised-lg">` gets that border and shadow instead of the button's own. Between two caller-facing classes of one family the later rule in the file wins, whatever their order in `className`; add a new class to the right group.

The one-raised-level rule is a single selector: the children of any `sk-raised*` surface get `--outline-shadow: var(--outline-flat)`. Hard resolves that to no shadow. Soft leaves `--outline-flat` undefined, which makes the declaration invalid and keeps `--outline-shadow` undefined too, so the soft fallbacks still apply.

Item and box cards sit in a wrapper that carries the hover shadow and the selection ring, while the `Card` inside carries `sk-raised`. Under a hard outline the wrapper's hover shadow is the card's own offset shadow, exactly under it, so hovering adds nothing blurred. The card's offset shadow would also cover the right and bottom edges of the wrapper's ring, so `sk-ring-selected` and `sk-ring-hover` repeat the ring as a CSS outline, which draws above the card.

Rules:

- Build surfaces from `components/ui`. A hand-built box never uses raw `border`, `border-t` / `border-b` or `shadow-*`: use `sk-outline` (or `sk-outline-control` for a form control), `sk-rule-*` for a divider, and `sk-raised*` if it floats or `sk-flat-*` if it is a backdrop. Raw utilities pin it to the soft look and it will clash on a hard page.
- Decide whether a surface is an object or a backdrop. Objects are raised; backdrops are ruled and flat. Do not raise a panel that holds raised cards.
- A utility passed by the caller still wins over these classes (`border-0`, `border-primary`, `shadow-none`, `outline-dashed`), in both styles, at rest and on hover. Passing `border` or `shadow-md` to a primitive pins it to the soft look. To change a primitive's border or elevation and keep it on the outline style, pass an `sk-*` class instead (`sk-outline`, `sk-raised-lg`).
- Hard borders take 1px more per side. Do not size content so tightly that it only fits a 1px border.
- Not affected: ghost and link buttons, `Tabs`, `Switch`, `divide-*` row separators inside a list box, tag chips, focus rings. A border with its own semantic colour (`border-destructive/40`, `border-primary/25`) keeps that colour and only takes the hard width. Selection rings keep their colour and size; on cards a hard outline only redraws them on top (above).
- Radix portals (dialogs, menus) render on `document.body`, so on a page that scopes a theme to a wrapper (public profile, shared wishlist) they follow the document's outline style, the same way they follow its colors.

## Motion

- **Approach:** Intentional and small. Comprehension and hover feedback, not choreography.
- **Buttons:** `transition-colors` / shadow / transform. `motion-safe:hover:-translate-y-0.5` with `motion-reduce` disabling movement (`components/ui/button.tsx`).
- **Accordions:** 200ms ease-out height (`tailwind.config.ts`).
- **Loaded content:** `sk-fade-in` (`app/globals.css`), a 200ms ease-out opacity fade, on whatever replaces a skeleton: card grids, empty states, tag chips, sparklines, the stats panel. `useSeenLoading()` (`lib/hooks/use-seen-loading.ts`) keeps it off content that was in the server render, so a page does not fade in on arrival. Off under `prefers-reduced-motion`. The landing mock uses the same class when you open a box or switch view.
- **Landing:** `ScrollReveal` plus the `sk-landing-*` keyframes in `app/globals.css` (hero settle, marquee, stamp spin, figure hop, blind-box machine). All of them switch off under `prefers-reduced-motion`. Keep this on marketing unless a product surface already uses it.
- **iOS:** `html.mobile-safari-drag-active` contains overscroll during drag so Safari chrome does not cancel DnD.

## Components

Built on shadcn/ui + Radix. Variants must stay token-based (`buttonVariants` is the pattern: `bg-primary text-primary-foreground hover:bg-primary/90`). The primitives also carry the outline classes, so a product component gets the user's outline style by using them.

When adding UI:

1. Copy an existing product component, not a generic shadcn demo with slate/zinc classes.
2. Preview against Light, Dark, and a loud custom theme (Pink or a high-contrast import), and once with Outline set to Hard. For anything in a collection grid, check both card densities.
3. Check tag chips, value/acquisition numbers, and graphs. Those are the first things that go off-theme.

## QA checklist

Flag in review or QA if code:

- Hardcodes a color that user themes cannot change
- Uses Tailwind palette utilities (`green-50`, `amber-200`, `blue-600`, …) on themed routes
- Adds a color without registry + editor group + `globals.css`
- Assumes Inter, white backgrounds, `0.5rem` radius, or 1px soft borders
- Draws a card, button, input, menu or dialog surface with raw `border` / `shadow-*` instead of a `components/ui` primitive or the `sk-outline*` / `sk-raised*` classes (it will ignore a hard outline)
- Adds a theme field without a default that keeps existing saved themes looking the same
- Breaks contrast by pairing `foreground` with a non-`background` surface without using the matching `*-foreground` token
- Applies the signed-in shrine on `/landing` or `/auth/*`
- Shows or hides a block, or changes a block's height, when data arrives (see [Layout stability](#layout-stability))

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-02 | Design system is token/role based; look is user-owned | Theme editor, import/export, and per-user CSS variables are the product. Documenting a single aesthetic would fight the app. |
| 2026-09-02 | Canonical file is `docs/DESIGN.md` | Project docs live in `docs/`. |
| 2026-09-02 | Marketing/auth stay on built-in defaults | Prevents shrine leak onto public pages (`shouldResetDocumentToDefaults`). |
| 2026-11-18 | Landing rebuilt as an interactive poster (live mock dashboard, Keepers, blind-box game) | Screenshots undersold a product whose point is customization. Demo themes are scoped to the mock, so the defaults-only rule for `/landing` still holds. |
| 2026-11-18 | Hard outline extended to backdrops: panels and dividers take the ink line, backdrops are flat, one raised level | Hard cards on soft panels looked like two systems. The landing poster and established hard-outline kits share the same three rules; the app now follows them through `sk-rule-*`, `sk-flat-*` and one nesting selector. |
| 2026-11-18 | Matcha and Arcade added as presets; presets may carry fonts and radius | The landing demo's themes should be things a user can actually pick. Theme files already carry fonts and radius, so presets now can too. |
| 2026-11-18 | Outline style (`soft` / `hard`) added as a theme field; `hard` is the landing's 2px foreground border and solid offset shadow | The landing look should be something a user can pick for their own shrine. It lives in the `color_scheme` JSON (no migration), defaults to soft so saved themes and presets do not change, and is applied through variables with soft fallbacks so the primitives carry it. |
| 2026-11-19 | One theme sanitiser (`sanitizeTheme()`) for saves, stored reads, imports and public pages; a theme carries only registry colors as HSL triples, one of four radii, and an outline | The settings API stored whatever it was sent, and the import, editor and public sanitiser each had their own, different rules. A value the app cannot render (comma or alpha colors, a free-form radius) is now dropped everywhere instead of being accepted in one place and breaking in another. |
| 2026-11-19 | Outline classes: single-class selectors with states in `:where()`, primitive defaults declared before caller-facing classes | `tailwind-merge` cannot arbitrate between `sk-*` classes, so a caller's class lost to the primitive's own and hover rules outranked caller utilities. Specificity and order now make "the caller wins" true, and a test pins both. |
| 2026-11-19 | Layout stability is a rule: one render path, sized skeletons, fixed-height slots for data-dependent blocks, opacity-only fade for loaded content | The dashboard jumped on every navigation: the move-to-parent zone and tag chips appeared after load, and each refetch collapsed the grids to one skeleton row. The tag strip moved into the item header (free from `md` up) and is always present for accounts with tags, which costs phones one line in boxes without tags. |
| 2026-11-18 | Dashboard additions: per-device card density (comfortable / compact), sparklines on owner box cards, Keepers in empty states and tag-tinted no-photo tiles, drop cues and grab cursors while dragging, tag quick-filter chips | The dashboard should be denser and say more at a glance without new colours: all of it paints with existing tokens. Density is a device preference, not a theme field, so it lives in localStorage (no migration) and defaults to the layout everyone already has. Keepers are the one in-app decoration, and only where a view is empty. |
