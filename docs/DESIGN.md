# Design System — ShrineKeep

ShrineKeep does not have one visual brand inside the app. Users do.

The product owns **structure, roles, and named tokens**. Each account owns **values**: colors, heading/body fonts, and border radius. Two users can look unrelated and still share the same layout, components, and CSS variable names.

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
| `/dashboard`, `/settings`, `/wishlist` (owned) | User `color_scheme` + fonts from `/api/colors` | Fully custom |
| `/wishlist/[token]` (public share) | Owner theme when `wishlist_apply_colors` is on | Owner's shrine, or defaults |
| `/landing`, `/`, `/auth/*`, `/legal/*` | Built-in `:root` defaults only | Product marketing / auth |

`ThemeProvider` resets document CSS variables on marketing/auth/legal routes so a logged-in user's shrine does not leak onto Sign Up.

## The rule that matters

**Paint with names, never with hex (or Tailwind palette colors) in product UI.**

- Use semantic Tailwind colors: `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, `bg-destructive`, `text-muted-foreground`, `bg-light-muted`, `ring-primary`, `ring-selectable-hover-ring`.
- Use CSS variables for anything Tailwind does not wrap: `hsl(var(--value-color))`, `hsl(var(--tag-red))`, `var(--radius)`, `var(--font-heading)`, `var(--font-sans)`.
- Helpers: `getTagChipStyle()` / `getTagForeground()` in `lib/utils.ts` for tag chips. `SELECTION_RING_CLASS` / `FOCUS_RING_CLASS` / `getSelectableRingClasses()` for selection and focus.
- **Do not** use `bg-green-50`, `text-blue-600`, `#1a1f2e`, `rgb()`, or hardcoded `hsl(...)` in components that render under a user theme.
- **Do not** invent a new color for one screen. If the role does not exist, add it to the registry (see below) so every theme, including imports/exports, gets it.

Default light/dark/pink values in `THEME_COLOR_REGISTRY` are **seeds**, not the brand. Pink Mode exists to prove the same structure can look like a different product.

## Color

- **Approach:** Named roles. Values are user-chosen HSL triples stored as `"H S% L%"` (no `hsl()` wrapper) so CSS can do `hsl(var(--token))` and opacity modifiers like `bg-primary/90`.
- **Canonical source:** `THEME_COLOR_REGISTRY` in `lib/theme-colors.ts`. Keys match `Theme` in `lib/types.ts`. CSS names are kebab-case (`cardForeground` → `--card-foreground`).
- **Tailwind bridge:** `tailwind.config.ts` maps shadcn tokens to `hsl(var(--...))`. Product-only tokens (value, graph, thumbnail, tags) are usually used as CSS variables directly.
- **Presets:** Light, Dark, Pink, Custom (`lib/settings.ts`). Custom is any saved `user_settings.color_scheme`.
- **Import/export:** JSON of color keys + `radius` + `header_font_family` + `body_font_family`. Chart overlay is **not** part of a theme file.

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

### Adding a color

1. Add the key to `Theme` in `lib/types.ts`.
2. Add a `THEME_COLOR_REGISTRY` entry (label + light/dark defaults).
3. Put the key in the right `THEME_EDITOR_GROUPS` group.
4. Add `:root` and `.dark` in `app/globals.css`.
5. If it is a shadcn-style token, add it to `tailwind.config.ts`.
6. Use only the named token in UI.

Skip a step and imported themes, the editor, or dark fallback will drift.

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

Prefer `text-fluid-*` in dashboard/settings/wishlist chrome. Fixed `text-sm` / `text-lg` is fine for tight controls (buttons, inputs) that already have fixed heights.

### Marketing exception

`/landing` may set display fonts per word (Bebas Neue, Playfair, Roboto, Merriweather, etc.). That is the product poster, not the in-app system. Do not copy that mixed-font trick into dashboard components.

## Spacing

- **Base unit:** 4px (Tailwind default). Common steps: 1, 2, 3, 4, 6, 8 (4/8/12/16/24/32px).
- **Density:** Compact. Collection grids, filters, and graphs need information density. Do not "spacious-redesign" the dashboard.
- **Container:** `container` centered, `padding: 2rem`, max `2xl: 1400px` (`tailwind.config.ts`).
- **Layout helpers:** `layout-shrink-visible` (flex/grid children that must shrink without clipping vertically), `truncate-line` (ellipsis without killing vertical overflow), `item-card-no-select` (selection mode vs text selection).

## Layout

- **Approach:** Grid-disciplined app. Marketing can be more editorial.
- **App chrome:** `min-h-screen bg-background`, `AppNav` on authenticated routes, content in container/padded columns.
- **Cards:** `bg-card text-card-foreground border-border`, radius from `--radius`.
- **Selection:** Primary ring when selected or drop-target; `--selectable-hover-ring` on hover in selection mode. Offset fill uses `ring-offset-background` so the hole matches the page, not a hardcoded white.
- **Min width:** Landing and several app shells use `min-w-[360px]` to avoid crushed controls.

## Radius

`--radius` is a theme field (`Theme.radius`), default `0.5rem`.

Editor options: None `0`, Small `0.25rem`, Medium `0.5rem`, Large `0.75rem`.

Tailwind: `rounded-lg` → `var(--radius)`, `rounded-md` → `calc(var(--radius) - 2px)`, `rounded-sm` → `calc(var(--radius) - 4px)`.

Prefer `rounded-md` / `rounded-lg` so user roundedness actually changes the UI. Hardcoded `rounded-2xl` / `rounded-full` is only for controls that must stay pill-shaped regardless of theme (document why if you add one).

## Motion

- **Approach:** Intentional and small. Comprehension and hover feedback, not choreography.
- **Buttons:** `transition-colors` / shadow / transform. `motion-safe:hover:-translate-y-0.5` with `motion-reduce` disabling movement (`components/ui/button.tsx`).
- **Accordions:** 200ms ease-out height (`tailwind.config.ts`).
- **Landing:** `ScrollReveal`, `Floating` (`float-slow` keyframes, amplitude via `--float-amp`). Keep this on marketing unless a product surface already uses it.
- **iOS:** `html.mobile-safari-drag-active` contains overscroll during drag so Safari chrome does not cancel DnD.

## Components

Built on shadcn/ui + Radix. Variants must stay token-based (`buttonVariants` is the pattern: `bg-primary text-primary-foreground hover:bg-primary/90`).

When adding UI:

1. Copy an existing product component, not a generic shadcn demo with slate/zinc classes.
2. Preview against Light, Dark, and a loud custom theme (Pink or a high-contrast import).
3. Check tag chips, value/acquisition numbers, and graphs. Those are the first things that go off-theme.

## QA checklist

Flag in review or QA if code:

- Hardcodes a color that user themes cannot change
- Uses Tailwind palette utilities (`green-50`, `amber-200`, `blue-600`, …) on themed routes
- Adds a color without registry + editor group + `globals.css`
- Assumes Inter, white backgrounds, or `0.5rem` radius
- Breaks contrast by pairing `foreground` with a non-`background` surface without using the matching `*-foreground` token
- Applies the signed-in shrine on `/landing` or `/auth/*`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-02 | Design system is token/role based; look is user-owned | Theme editor, import/export, and per-user CSS variables are the product. Documenting a single aesthetic would fight the app. |
| 2026-09-02 | Canonical file is `docs/DESIGN.md` | Project docs live in `docs/`. |
| 2026-09-02 | Marketing/auth stay on built-in defaults | Prevents shrine leak onto public pages (`shouldResetDocumentToDefaults`). |
