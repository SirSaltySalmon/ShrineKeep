"use client"

import * as React from "react"
import {
  DndContext,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowUpToLine,
  Bot,
  Camera,
  Check,
  ChevronRight,
  Disc3,
  Heart,
  Home,
  Keyboard,
  Package,
  PenTool,
  Rabbit,
  Rocket,
  RotateCcw,
  Settings,
  Shield,
  Users,
  Watch,
  type LucideIcon,
} from "lucide-react"
import { cn, formatCurrency, SELECTION_RING_CLASS } from "@/lib/utils"
import { applyColorScheme, COLOR_SCHEME_PRESETS, resolveThemePreset, type ThemePreset } from "@/lib/settings"
import { DEFAULT_THEME_RADIUS, THEME_RADIUS_OPTIONS } from "@/lib/theme-colors"
import { FONT_FAMILY_CSS, type FontFamilyId } from "@/lib/fonts"
import { FadeOnChange } from "@/components/fade-on-change"
import { useFadeOnChange } from "@/lib/hooks/use-fade-on-change"
import { dashboardDndCollisionDetection } from "@/lib/dashboard-dnd-collision"
import { NonTouchPointerSensor } from "@/lib/non-touch-pointer-sensor"
import {
  ownedInSubtree,
  pathTo,
  resolveDrop,
  type BoxNode,
  type DragData,
  type DropTarget,
  type PlacedItem,
} from "@/lib/landing/mock-dashboard"
import { HARD_SHADOW, LANDING_FONT } from "@/lib/landing/tokens"
import type { TagColor, Theme } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { SiteLogoMark } from "@/components/site-logo"
import { MoneyStats } from "@/components/landing/money-stats"

/**
 * A working miniature of the dashboard for the landing page. Everything here is
 * client state: nothing is fetched or saved.
 *
 * It follows the real dashboard's model (lib/hooks/use-dashboard-dnd.ts):
 * - an item lives in exactly one place, a box or the root, never both;
 * - a view shows only that place's own boxes and items, while totals roll up the subtree;
 * - items and boxes are dragged onto a box card, the "move to parent" zone, or a breadcrumb.
 * Those rules are in `lib/landing/mock-dashboard.ts`.
 *
 * It is themed by scoping the real `applyColorScheme()` output to one wrapper, so
 * the landing page itself stays on built-in defaults (docs/DESIGN.md, "Two faces").
 */

/* ----------------------------- demo themes ----------------------------- */

interface DemoTheme {
  id: string
  name: string
  scheme: Theme
  heading: FontFamilyId
  body: FontFamilyId
  radius: string
}

// The demo offers exactly the app's built-in presets (Settings -> Theme), resolved the same
// way the settings page resolves them, so what a visitor sees here is what the preset does.
const DEMO_PRESETS = ["light", "dark", "pink", "matcha", "arcade"] as const satisfies readonly ThemePreset[]

const DEMO_THEMES: DemoTheme[] = DEMO_PRESETS.map((id) => {
  const resolved = resolveThemePreset(id)
  return {
    id,
    name: COLOR_SCHEME_PRESETS[id].name.replace(/ Mode$/, ""),
    scheme: resolved.scheme,
    heading: resolved.headerFontFamily,
    body: resolved.bodyFontFamily,
    radius: resolved.scheme.radius ?? DEFAULT_THEME_RADIUS,
  }
})

const HEADING_FONTS: FontFamilyId[] = ["Inter", "Playfair Display", "Bebas Neue", "JetBrains Mono", "Lora", "Comic Sans"]

/* ------------------------------ demo data ------------------------------ */

interface DemoTag {
  name: string
  color: TagColor
}

const TAGS = {
  mecha: { name: "Mecha", color: "red" },
  hg: { name: "HG", color: "blue" },
  mg: { name: "MG", color: "blue" },
  rg: { name: "RG", color: "blue" },
  vinyl: { name: "Vinyl", color: "violet" },
  sealed: { name: "Sealed", color: "green" },
  keeb: { name: "Keeb", color: "orange" },
  groupBuy: { name: "Group buy", color: "yellow" },
  film: { name: "Film", color: "green" },
  stationery: { name: "Stationery", color: "yellow" },
  watch: { name: "Watch", color: "indigo" },
  plush: { name: "Plush", color: "orange" },
} satisfies Record<string, DemoTag>

interface DemoBox extends BoxNode {
  name: string
}

const INITIAL_BOXES: DemoBox[] = [
  { id: "mecha", name: "Mecha kits", parentId: null },
  { id: "vinyl", name: "Vinyl", parentId: null },
  { id: "keebs", name: "Keyboards", parentId: null },
  { id: "backlog", name: "Unbuilt backlog", parentId: "mecha" },
]

interface DemoItem extends PlacedItem {
  name: string
  icon: LucideIcon
  tint: TagColor
  tags: DemoTag[]
  value: number
  /** What was paid, or what it is expected to cost while still on the wishlist. */
  price: number
  date: string
}

// Array order is acquisition order; the graph accumulates along it.
const INITIAL_ITEMS: DemoItem[] = [
  { id: "trainer", name: "Trainer Type 1/144", boxId: "mecha", icon: Rocket, tint: "blue", tags: [TAGS.mecha, TAGS.hg], value: 28, price: 22, date: "Jan 14" },
  { id: "midnight", name: "Midnight Arcade, 1st press", boxId: "vinyl", icon: Disc3, tint: "violet", tags: [TAGS.vinyl, TAGS.sealed], value: 140, price: 38, date: "Feb 3" },
  { id: "comet", name: "Crimson Comet 1/100", boxId: "mecha", icon: Bot, tint: "red", tags: [TAGS.mecha, TAGS.mg], value: 95, price: 72, date: "Mar 2" },
  { id: "alice", name: "Alice 65, lavender", boxId: "keebs", icon: Keyboard, tint: "orange", tags: [TAGS.keeb, TAGS.groupBuy], value: 310, price: 420, date: "Apr 1" },
  { id: "white", name: "White Unit 1/144", boxId: "backlog", icon: Shield, tint: "indigo", tags: [TAGS.mecha, TAGS.rg], value: 48, price: 40, date: "May 20" },
  { id: "bluehours", name: "Blue Hours, 180g", boxId: "vinyl", icon: Disc3, tint: "blue", tags: [TAGS.vinyl], value: 34, price: 29, date: "Jun 9" },
  // Loose at the root: things that do not belong in any box yet.
  { id: "camera", name: "Half-frame film camera", boxId: null, icon: Camera, tint: "green", tags: [TAGS.film], value: 180, price: 140, date: "Jul 12" },
  { id: "pen", name: "Brass fountain pen", boxId: null, icon: PenTool, tint: "yellow", tags: [TAGS.stationery], value: 64, price: 58, date: "Aug 2" },
  { id: "fieldwatch", name: "Field watch, 38mm", boxId: null, icon: Watch, tint: "indigo", tags: [TAGS.watch], value: 210, price: 195, date: "Sep 19" },
  { id: "plush", name: "Moon rabbit plush", boxId: null, icon: Rabbit, tint: "orange", tags: [TAGS.plush], value: 35, price: 30, date: "Oct 5" },
  { id: "night", name: "Night Type 1/60", boxId: "mecha", icon: Bot, tint: "indigo", tags: [TAGS.mecha], value: 275, price: 260, date: "Today", wishlist: true },
  { id: "tapedeck", name: "Tape Deck Sessions LP", boxId: "vinyl", icon: Disc3, tint: "green", tags: [TAGS.vinyl], value: 52, price: 45, date: "Today", wishlist: true },
  { id: "brass", name: "Brass plate TKL", boxId: "keebs", icon: Keyboard, tint: "yellow", tags: [TAGS.keeb], value: 395, price: 380, date: "Today", wishlist: true },
]

const tagStyle = (color: TagColor): React.CSSProperties => ({
  background: `hsl(var(--tag-${color}))`,
  color: "hsl(var(--tag-foreground))",
})

/** The no-photo tile at the top of an item card, washed in the item's tint. */
function ItemTile({ item }: { item: DemoItem }) {
  return (
    <div className="flex h-16 items-center justify-center sm:h-20" style={{ background: `hsl(var(--tag-${item.tint}) / 0.16)` }}>
      <item.icon className="h-8 w-8" style={{ color: `hsl(var(--tag-${item.tint}))` }} aria-hidden />
    </div>
  )
}

/* --------------------------- drag-and-drop bits ------------------------- */

const DEMO_DND_CONTEXT_ID = "landing-demo-dnd"

/**
 * Keeps a dragged card inside the visible part of its first scrolling ancestor (the view, from lg
 * up). A card moved by transform past the bottom would otherwise extend the view's scroll height,
 * auto-scroll would follow it, and the view would keep growing. Same rule as
 * `restrictToFirstScrollableAncestor` in @dnd-kit/modifiers.
 */
const keepInsideScrollView: Modifier = ({ transform, draggingNodeRect, scrollableAncestorRects }) => {
  const bounds = scrollableAncestorRects[0]
  if (!draggingNodeRect || !bounds) return transform
  const next = { ...transform }
  if (draggingNodeRect.top + transform.y <= bounds.top) next.y = bounds.top - draggingNodeRect.top
  else if (draggingNodeRect.bottom + transform.y >= bounds.top + bounds.height)
    next.y = bounds.top + bounds.height - draggingNodeRect.bottom
  if (draggingNodeRect.left + transform.x <= bounds.left) next.x = bounds.left - draggingNodeRect.left
  else if (draggingNodeRect.right + transform.x >= bounds.left + bounds.width)
    next.x = bounds.left + bounds.width - draggingNodeRect.right
  return next
}

/**
 * The demo's height from lg up: one screen less the fixed nav and a small margin, so the window
 * fills the screen when scrolled to (the section heading sits above it). Very short windows stop
 * at 28rem.
 */
const MOCK_DESKTOP_HEIGHT = "lg:h-[max(28rem,calc(100svh_-_6rem))]"

/*
 * Surfaces inside the themed wrapper take their border and shadow from the outline classes
 * (docs/DESIGN.md, "Outline"), so the mock follows a preset with a hard outline.
 */
const DRAG_BASE_CLASS =
  "item-card-no-select cursor-grab touch-manipulation sk-outline transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-0.5 hover:sk-raised-md"

function dragStyle(transform: Parameters<typeof CSS.Translate.toString>[0], isDragging: boolean): React.CSSProperties {
  return {
    transform: CSS.Translate.toString(transform),
    // The landing page must stay scrollable under a finger, so no `touch-action: none` here:
    // TouchSensor's long-press takes over the gesture once a drag actually starts.
    WebkitTouchCallout: "none",
    ...(isDragging ? { opacity: 0.75, zIndex: 30, position: "relative", transition: "none", cursor: "grabbing" } : null),
  }
}

function DemoItemCard({ item }: { item: DemoItem }) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { kind: "item", id: item.id } satisfies DragData,
  })

  return (
    <article
      ref={setNodeRef}
      style={dragStyle(transform, isDragging)}
      className={cn(
        DRAG_BASE_CLASS,
        "min-w-0 overflow-hidden rounded-lg bg-card text-card-foreground",
        isDragging && "sk-raised-lg"
      )}
      data-demo-item={item.id}
      {...listeners}
    >
      <ItemTile item={item} />
      <div className="space-y-0.5 p-2.5">
        <h4 className="truncate text-fluid-sm font-semibold" title={item.name}>
          {item.name}
        </h4>
        <p className="truncate text-fluid-xs font-medium" style={{ color: "hsl(var(--value-color))" }}>
          Value: {formatCurrency(item.value)}
        </p>
        <p className="truncate text-fluid-xs" style={{ color: "hsl(var(--acquisition-color))" }}>
          Acquired for: {formatCurrency(item.price)}
        </p>
        <p className="truncate text-fluid-xs text-muted-foreground">{item.date}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {item.tags.map((t) => (
            <span key={t.name} className="rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-4" style={tagStyle(t.color)}>
              {t.name}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

function DemoBoxCard({
  box,
  itemCount,
  totalValue,
  dragActive,
  onOpen,
}: {
  box: DemoBox
  itemCount: number
  totalValue: number
  dragActive: boolean
  onOpen: () => void
}) {
  const { listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `box-drag-${box.id}`,
    data: { kind: "box", id: box.id } satisfies DragData,
  })
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `box-${box.id}`,
    data: { to: "box", boxId: box.id } satisfies DropTarget,
    disabled: isDragging,
  })
  const setRefs = React.useCallback(
    (node: HTMLButtonElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef]
  )

  return (
    <button
      ref={setRefs}
      type="button"
      onClick={onOpen}
      style={dragStyle(transform, isDragging)}
      className={cn(
        DRAG_BASE_CLASS,
        "min-w-0 rounded-lg bg-card p-2.5 text-left text-card-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // While something else is in the air, every box advertises itself as a place to drop it.
        dragActive && !isDragging && "border-dashed border-primary/60",
        isOver && cn(SELECTION_RING_CLASS, "bg-accent text-accent-foreground"),
        isDragging && "sk-raised-lg"
      )}
      data-demo-box={box.id}
      {...listeners}
    >
      <span className="flex items-center gap-1.5">
        <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate font-heading text-fluid-sm font-semibold">{box.name}</span>
      </span>
      <span className="mt-1 block truncate text-fluid-xs text-muted-foreground">
        {/* A drop changes what a box holds: its count and total fade to the new figures. */}
        <FadeOnChange signal={`${itemCount}:${totalValue}`}>
          {itemCount} {itemCount === 1 ? "item" : "items"} · {formatCurrency(totalValue)}
        </FadeOnChange>
      </span>
    </button>
  )
}

/** Breadcrumb that doubles as a drop target, like the real dashboard's crumbs. */
function DropCrumb({
  dropId,
  targetBoxId,
  dropDisabled = false,
  dragActive,
  onNavigate,
  children,
}: {
  dropId: string
  targetBoxId: string | null
  dropDisabled?: boolean
  dragActive: boolean
  onNavigate: () => void
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: { to: "box", boxId: targetBoxId } satisfies DropTarget,
    disabled: dropDisabled,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => {
        if (!dragActive) onNavigate()
      }}
      className={cn(
        "flex min-h-8 min-w-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragActive && !dropDisabled && "outline-dashed outline-1 outline-primary/60",
        isOver && "bg-primary/10 text-primary ring-2 ring-primary/40"
      )}
    >
      {children}
    </button>
  )
}

function MoveToParentZone({ label }: { label: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: "drop-zone-parent",
    data: { to: "parent" } satisfies DropTarget,
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-light-muted px-3 py-2.5 text-muted-foreground transition-colors",
        isOver && "border-primary bg-primary/10 text-primary"
      )}
    >
      <ArrowUpToLine className="h-4 w-4 shrink-0" aria-hidden />
      {/* Size on the label, not the merged class list above (see the nav tabs). */}
      <span className="min-w-0 truncate text-fluid-sm">{label}</span>
    </div>
  )
}

/* -------------------------------- chart -------------------------------- */

function MiniChart({ items }: { items: DemoItem[] }) {
  const W = 300
  const H = 72
  let value = 0
  let spend = 0
  const points = [{ value: 0, spend: 0 }, ...items.map((item) => ({ value: (value += item.value), spend: (spend += item.price) }))]
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.spend))) * 1.12
  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * W)
  const y = (v: number) => H - (v / max) * H
  const line = (key: "value" | "spend") => points.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ")

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full overflow-visible" aria-hidden>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="hsl(var(--graph-grid-color))" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ))}
      <line x1={0} x2={W} y1={H} y2={H} stroke="hsl(var(--graph-axis-color))" vectorEffect="non-scaling-stroke" />
      {(["spend", "value"] as const).map((key) => (
        <polyline
          key={key}
          points={line(key)}
          fill="none"
          stroke={key === "value" ? "hsl(var(--graph-value-color))" : "hsl(var(--graph-acquisition-color))"}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

/* ------------------------------ component ------------------------------ */

export function MockDashboard() {
  const [themeId, setThemeId] = React.useState("light")
  const [headingOverride, setHeadingOverride] = React.useState<FontFamilyId | null>(null)
  const [radiusOverride, setRadiusOverride] = React.useState<string | null>(null)
  const [view, setView] = React.useState<"dashboard" | "wishlist">("dashboard")
  const [boxes, setBoxes] = React.useState<DemoBox[]>(INITIAL_BOXES)
  const [items, setItems] = React.useState<DemoItem[]>(INITIAL_ITEMS)
  const [boxId, setBoxId] = React.useState<string | null>(null)
  const [tag, setTag] = React.useState<string | null>(null)
  const [activeDrag, setActiveDrag] = React.useState<DragData | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  // The mock has nothing to wait for, so "loaded" here is "you went somewhere": the contents
  // of the place you opened fade in, as the real dashboard's do after its skeleton. Off until
  // the first navigation so the page itself does not fade the demo in.
  const [navigated, setNavigated] = React.useState(false)

  // Same split as the dashboard: mouse and pen drag after 8px, touch drags after a long-press
  // so a swipe that starts on a card still scrolls the page.
  const sensors = useSensors(
    useSensor(NonTouchPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const theme = DEMO_THEMES.find((t) => t.id === themeId) ?? DEMO_THEMES[0]
  const heading = headingOverride ?? theme.heading
  const radius = radiusOverride ?? theme.radius

  const themeStyle = React.useMemo<React.CSSProperties>(
    () => ({
      ...applyColorScheme(theme.scheme, {
        headerFontFamily: FONT_FAMILY_CSS[heading],
        bodyFontFamily: FONT_FAMILY_CSS[theme.body],
      }),
      ["--radius" as string]: radius,
      fontFamily: FONT_FAMILY_CSS[theme.body],
    }),
    [theme, heading, radius]
  )

  const activeBox = boxes.find((box) => box.id === boxId) ?? null
  const path = pathTo(boxes, boxId)
  const boxName = (id: string | null) => (id === null ? "Home" : (boxes.find((box) => box.id === id)?.name ?? "Home"))

  // What this view shows: only the boxes and items that live exactly here.
  const childBoxes = boxes.filter((box) => box.parentId === boxId)
  const hereItems = items.filter((item) => !item.wishlist && item.boxId === boxId)
  const hereTags = hereItems
    .flatMap((item) => item.tags)
    .filter((t, i, all) => all.findIndex((other) => other.name === t.name) === i)
  const activeTag = tag && hereTags.some((t) => t.name === tag) ? tag : null
  const visibleItems = activeTag ? hereItems.filter((item) => item.tags.some((t) => t.name === activeTag)) : hereItems

  // What the numbers cover: this place and everything nested in it.
  const subtreeItems = ownedInSubtree(items, boxes, boxId)
  const totalValue = subtreeItems.reduce((sum, item) => sum + item.value, 0)
  const totalSpend = subtreeItems.reduce((sum, item) => sum + item.price, 0)

  const wishlist = items.filter((item) => item.wishlist)
  const wishlistTotal = INITIAL_ITEMS.filter((item) => item.wishlist).length
  const dragActive = activeDrag !== null

  const pickTheme = (id: string) => {
    setThemeId(id)
    setHeadingOverride(null)
    setRadiusOverride(null)
  }

  const openBox = (id: string | null) => {
    setBoxId(id)
    setTag(null)
    setNavigated(true)
  }

  const openView = (next: "dashboard" | "wishlist") => {
    setView(next)
    setNavigated(true)
  }

  /** Keyed by place, so the wrapper remounts (and its fade replays) on each navigation. */
  const placeFadeClass = navigated ? "sk-fade-in" : undefined
  // The parts that change without the place remounting: the trail and chart of another box,
  // and the items left by a tag filter.
  const crumbsRef = useFadeOnChange<HTMLDivElement>(path.map((crumb) => crumb.id).join("/"))
  const chartRef = useFadeOnChange<HTMLDivElement>(boxId ?? "home")
  const itemsRef = useFadeOnChange<HTMLDivElement>(activeTag ?? "")

  // Acquiring removes the card that holds the focused button. Once the list has re-rendered,
  // focus goes to the action now at that position: the next card's button, the last card's if
  // there is no next, or "Back to dashboard" when the list is empty.
  const viewRef = React.useRef<HTMLDivElement>(null)
  const refocusAt = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (refocusAt.current === null) return
    const actions = viewRef.current?.querySelectorAll<HTMLElement>("[data-wishlist-action]")
    actions?.[Math.min(refocusAt.current, actions.length - 1)]?.focus()
    refocusAt.current = null
  }, [items])

  // While the view scrolls inside the frame (lg up), a drag auto-scrolls only the view: the card
  // cannot leave it, so scrolling the page would just carry the demo away. Below lg the view does
  // not scroll and the page does.
  const autoScroll = React.useMemo(
    () => ({
      canScroll: (element: Element) => {
        const viewEl = viewRef.current
        return !viewEl || element === viewEl || getComputedStyle(viewEl).overflowY === "visible"
      },
    }),
    []
  )

  // From lg up the view scrolls inside the frame; another place starts at its top.
  React.useEffect(() => {
    viewRef.current?.scrollTo({ top: 0 })
  }, [view, boxId])

  const acquire = (id: string) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    refocusAt.current = wishlist.indexOf(item)
    // Acquired items join the end of the collection, so the graph steps up at "today".
    setItems([...items.filter((candidate) => candidate.id !== id), { ...item, wishlist: false }])
    setNotice(`${item.name} is now in ${boxName(item.boxId)}.`)
  }

  const resetDemo = () => {
    setBoxes(INITIAL_BOXES)
    setItems(INITIAL_ITEMS)
    setBoxId(null)
    setTag(null)
    setNotice(null)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDrag(null)
    const drag = active.data.current as DragData | undefined
    const target = over?.data.current as DropTarget | undefined
    if (!drag || !target) return
    const move = resolveDrop(drag, target, { boxes, items, openBoxId: boxId })
    if (!move) return

    if (drag.kind === "item") {
      // One home per item: moving it rewrites that single reference.
      setItems(items.map((candidate) => (candidate.id === drag.id ? { ...candidate, boxId: move.boxId } : candidate)))
      setNotice(`Moved ${items.find((candidate) => candidate.id === drag.id)?.name} to ${boxName(move.boxId)}.`)
      return
    }
    setBoxes(boxes.map((candidate) => (candidate.id === drag.id ? { ...candidate, parentId: move.boxId } : candidate)))
    setNotice(`Moved ${boxName(drag.id)} into ${boxName(move.boxId)}.`)
  }

  const navButton = (target: "dashboard" | "wishlist", label: string, Icon: LucideIcon) => (
    <button
      type="button"
      onClick={() => openView(target)}
      aria-current={view === target ? "page" : undefined}
      className={cn(
        // Font size comes from the nav row: tailwind-merge reads `text-fluid-*` as a colour and
        // would drop it here whenever the unselected `text-muted-foreground` is appended.
        "flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        view === target ? "font-semibold underline underline-offset-4" : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )

  return (
    // From lg up the demo is one screen tall (`MOCK_DESKTOP_HEIGHT`): the view and the theme
    // editor scroll inside it instead of the page growing.
    <div className={`grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:grid-rows-[minmax(0,1fr)] ${MOCK_DESKTOP_HEIGHT}`}>
      {/* Browser frame: landing tokens outside, shrine tokens inside. */}
      <div className={`min-w-0 overflow-hidden rounded-lg border-2 border-foreground bg-background lg:flex lg:min-h-0 lg:flex-col ${HARD_SHADOW}`}>
        <div className="flex items-center gap-3 border-b-2 border-foreground bg-light-muted px-3 py-2">
          <div className="flex gap-1.5" aria-hidden>
            {(["red", "yellow", "green"] as const).map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full border border-foreground" style={{ background: `hsl(var(--tag-${c}))` }} />
            ))}
          </div>
          <div
            className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-0.5 text-fluid-xs text-muted-foreground"
            style={{ fontFamily: LANDING_FONT.mono }}
          >
            shrinekeep.com/{view}
          </div>
          <span className="hidden text-fluid-xs font-medium text-muted-foreground sm:block">Live demo</span>
        </div>

        <div
          style={themeStyle}
          className="bg-background text-foreground transition-colors duration-300 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
          data-demo-theme={theme.id}
        >
          <div className="flex items-center gap-2 overflow-x-auto sk-rule-b px-3 py-2 text-fluid-sm sm:gap-3 sm:px-4">
            <span className="flex shrink-0 items-center gap-1 font-heading font-semibold">
              <SiteLogoMark className="h-6 w-6" />
              ShrineKeep
            </span>
            {navButton("dashboard", "Dashboard", Package)}
            {navButton("wishlist", "Wishlist", Heart)}
            <span className="hidden items-center gap-1 px-1.5 text-muted-foreground sm:flex">
              <Users className="h-4 w-4" aria-hidden /> Social
            </span>
            <span className="hidden items-center gap-1 px-1.5 text-muted-foreground sm:flex">
              <Settings className="h-4 w-4" aria-hidden /> Settings
            </span>
          </div>

          <div ref={viewRef} className="min-h-[36rem] space-y-3 p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {view === "dashboard" ? (
              <DndContext
                id={DEMO_DND_CONTEXT_ID}
                sensors={sensors}
                collisionDetection={dashboardDndCollisionDetection}
                modifiers={[keepInsideScrollView]}
                autoScroll={autoScroll}
                onDragStart={({ active }) => setActiveDrag((active.data.current as DragData | undefined) ?? null)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDrag(null)}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <nav aria-label="Demo breadcrumb" className="flex min-w-0 flex-wrap items-center gap-0.5 text-fluid-sm">
                    <DropCrumb
                      dropId="crumb-root"
                      targetBoxId={null}
                      dropDisabled={boxId === null}
                      dragActive={dragActive}
                      onNavigate={() => openBox(null)}
                    >
                      <Home className="h-4 w-4 shrink-0" aria-hidden />
                      <span className={cn(activeBox && "text-muted-foreground")}>Home</span>
                    </DropCrumb>
                    <div ref={crumbsRef} className="flex min-w-0 flex-wrap items-center gap-0.5">
                    {path.map((crumb, index) => {
                      const isLast = index === path.length - 1
                      return (
                        <React.Fragment key={crumb.id}>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          {isLast ? (
                            <span className="min-w-0 truncate px-1.5 font-medium">{crumb.name}</span>
                          ) : (
                            <DropCrumb
                              dropId={`crumb-${crumb.id}`}
                              targetBoxId={crumb.id}
                              dragActive={dragActive}
                              onNavigate={() => openBox(crumb.id)}
                            >
                              <span className="min-w-0 truncate text-muted-foreground">{crumb.name}</span>
                            </DropCrumb>
                          )}
                        </React.Fragment>
                      )
                    })}
                    </div>
                  </nav>
                  <button
                    type="button"
                    onClick={resetDemo}
                    className="flex items-center gap-1 rounded-md px-1.5 py-1 text-fluid-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Reset demo
                  </button>
                </div>

                <div className="rounded-lg sk-outline bg-card p-3 text-card-foreground">
                  <MoneyStats value={totalValue} spent={totalSpend} size="sm" />
                  <div ref={chartRef} className="mt-2">
                    <MiniChart items={subtreeItems} />
                  </div>
                </div>

                <p className="min-h-[1.25rem] text-fluid-xs text-muted-foreground" aria-live="polite">
                  <FadeOnChange signal={notice}>
                    {notice ?? (
                      <>
                        Drag an item or a whole box onto a box to move it
                        <span className="hidden [@media(pointer:coarse)]:inline"> (press and hold first)</span>. Everything
                        lives in exactly one place.
                      </>
                    )}
                  </FadeOnChange>
                </p>

                <div key={boxId ?? "home"} className={cn("space-y-3", placeFadeClass)}>
                {childBoxes.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {childBoxes.map((box) => {
                      const inside = ownedInSubtree(items, boxes, box.id)
                      return (
                        <DemoBoxCard
                          key={box.id}
                          box={box}
                          itemCount={inside.length}
                          totalValue={inside.reduce((sum, item) => sum + item.value, 0)}
                          dragActive={dragActive}
                          onOpen={() => openBox(box.id)}
                        />
                      )
                    })}
                  </div>
                )}

                {activeBox && (
                  <MoveToParentZone label={activeBox.parentId ? `Move to "${boxName(activeBox.parentId)}"` : "Move to root (no box)"} />
                )}

                {hereTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-fluid-xs text-muted-foreground">Tags</span>
                    {hereTags.map((t) => {
                      const active = activeTag === t.name
                      return (
                        <button
                          key={t.name}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTag(active ? null : t.name)}
                          className={cn(
                            "rounded-md border-2 px-1.5 py-0.5 text-fluid-xs font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            activeTag && !active && "opacity-45"
                          )}
                          style={
                            active || !activeTag
                              ? { ...tagStyle(t.color), borderColor: `hsl(var(--tag-${t.color}))` }
                              : { borderColor: `hsl(var(--tag-${t.color}))` }
                          }
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div ref={itemsRef}>
                {visibleItems.length === 0 ? (
                  <p className="rounded-lg border-dashed sk-outline p-6 text-center text-fluid-sm text-muted-foreground">
                    {activeBox
                      ? childBoxes.length > 0
                        ? `No loose items in ${activeBox.name}. They are all in the boxes above.`
                        : `${activeBox.name} is empty. Go Home and drag something in.`
                      : "Nothing loose at Home. Everything has a box."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {visibleItems.map((item) => (
                      <DemoItemCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
                </div>
                </div>
              </DndContext>
            ) : (
              <div className={cn("space-y-3", placeFadeClass)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-fluid-xl font-semibold">Wishlist</h3>
                  <p className="text-fluid-xs text-muted-foreground" aria-live="polite">
                    <FadeOnChange signal={wishlist.length}>{wishlistTotal - wishlist.length}</FadeOnChange> of {wishlistTotal} acquired
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${((wishlistTotal - wishlist.length) / wishlistTotal) * 100}%` }}
                  />
                </div>
                {wishlist.length === 0 ? (
                  // Same empty copy as the real wishlist (app/wishlist/wishlist-client.tsx).
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">Your wishlist is empty. Add items you want to acquire!</p>
                    <Button size="sm" variant="outline" className="mt-4" onClick={() => openView("dashboard")} data-wishlist-action>
                      Back to dashboard
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {wishlist.map((item) => (
                      <article key={item.id} className="min-w-0 overflow-hidden rounded-lg sk-outline bg-card text-card-foreground">
                        <ItemTile item={item} />
                        <div className="space-y-1 p-2.5">
                          <h4 className="truncate text-fluid-sm font-semibold" title={item.name}>
                            {item.name}
                          </h4>
                          <p className="truncate text-fluid-xs" style={{ color: "hsl(var(--acquisition-color))" }}>
                            Expected: {formatCurrency(item.price)}
                          </p>
                          <p className="truncate text-fluid-xs text-muted-foreground">For {boxName(item.boxId)}</p>
                          <Button size="sm" className="mt-1 h-8 w-full text-xs" onClick={() => acquire(item.id)} data-wishlist-action>
                            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                            Mark as Acquired
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Theme controls: the same three knobs the real theme editor exposes. */}
      <aside
        className={`rounded-lg border-2 border-foreground bg-background p-4 lg:min-h-0 lg:overflow-y-auto ${HARD_SHADOW}`}
        aria-label="Demo theme controls"
      >
        <p className="text-fluid-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: LANDING_FONT.mono }}>
          Theme editor
        </p>

        <fieldset className="mt-3">
          <legend className="text-fluid-sm font-semibold">Colours</legend>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {DEMO_THEMES.map((t) => {
              const active = t.id === themeId
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickTheme(t.id)}
                  className="group flex flex-col items-center gap-1 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "relative block h-9 w-9 overflow-hidden rounded-full border-2 border-foreground transition-transform motion-safe:group-hover:-translate-y-0.5",
                      active && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    )}
                    style={{ background: `hsl(${t.scheme.background})` }}
                  >
                    <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: `hsl(${t.scheme.primary})` }} />
                    <span className="absolute bottom-0 left-0 h-1/3 w-full" style={{ background: `hsl(${t.scheme.valueColor})` }} />
                  </span>
                  <span className={cn("text-[11px] leading-none", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{t.name}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-fluid-sm font-semibold">Heading font</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HEADING_FONTS.map((font) => {
              const active = heading === font
              return (
                <button
                  key={font}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHeadingOverride(font)}
                  className={cn(
                    "rounded-md border-2 px-2 py-1 text-xs leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"
                  )}
                  style={{ fontFamily: FONT_FAMILY_CSS[font] }}
                >
                  {font}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-fluid-sm font-semibold">Corners</legend>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {THEME_RADIUS_OPTIONS.map((option) => {
              const active = radius === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRadiusOverride(option.value)}
                  className={cn(
                    "border-2 px-1 py-1.5 text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"
                  )}
                  style={{ borderRadius: option.value }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <p className="text-fluid-sm font-semibold">Export</p>
          <pre
            className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-light-muted p-2.5 text-[11px] leading-relaxed text-foreground [overflow-wrap:anywhere]"
            style={{ fontFamily: LANDING_FONT.mono }}
          >
            {`{
  "background": "${theme.scheme.background}",
  "primary": "${theme.scheme.primary}",
  "valueColor": "${theme.scheme.valueColor}",
  "radius": "${radius}",
  "header_font_family": "${heading}",
  "body_font_family": "${theme.body}"
}`}
          </pre>
          <p className="mt-2 text-fluid-xs text-muted-foreground">
            A real theme file carries every colour in the app. Export yours, import a friend&apos;s.
          </p>
        </div>
      </aside>
    </div>
  )
}
