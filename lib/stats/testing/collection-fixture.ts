import type { FakeRow, FakeTables } from "./fake-supabase"

/** A well-formed uuid from a small number, so fixtures stay readable. */
export function fixtureId(kind: "user" | "box" | "item" | "record", n: number): string {
  const group = { user: "aaaa", box: "bbbb", item: "cccc", record: "dddd" }[kind]
  return `00000000-${group}-4000-8000-${String(n).padStart(12, "0")}`
}

export const OWNER = fixtureId("user", 1)
export const STRANGER = fixtureId("user", 2)

/** The fixed "today" these fixtures are written around. */
export const FIXTURE_NOW = new Date("2026-07-01T12:00:00.000Z")
export const FIXTURE_TODAY = "2026-07-01"

export const BOX = {
  /** Root box holding two nested levels. */
  shelf: fixtureId("box", 1),
  /** Inside `shelf`. */
  drawer: fixtureId("box", 2),
  /** Inside `drawer`. */
  tin: fixtureId("box", 3),
  /** Root box with nothing in it. */
  empty: fixtureId("box", 4),
  /** Root box whose only item has no history and no acquisition date. */
  plain: fixtureId("box", 5),
  /** Another user's box. */
  strangers: fixtureId("box", 9),
}

/** Which of the owner's boxes each owner box's stats cover. */
export const SUBTREE: Record<string, string[]> = {
  [BOX.shelf]: [BOX.shelf, BOX.drawer, BOX.tin],
  [BOX.drawer]: [BOX.drawer, BOX.tin],
  [BOX.tin]: [BOX.tin],
  [BOX.empty]: [BOX.empty],
  [BOX.plain]: [BOX.plain],
}

function box(id: string, userId: string, parent: string | null): FakeRow {
  return { id, user_id: userId, parent_box_id: parent, name: id, position: 0 }
}

function item(
  n: number,
  userId: string,
  boxId: string | null,
  fields: Partial<{
    current_value: number | null
    acquisition_date: string | null
    acquisition_price: number | null
    is_wishlist: boolean
  }> = {}
): FakeRow {
  return {
    id: fixtureId("item", n),
    user_id: userId,
    box_id: boxId,
    current_value: null,
    acquisition_date: null,
    acquisition_price: null,
    is_wishlist: false,
    ...fields,
  }
}

let recordSeq = 0
function record(itemN: number, recordedAt: string, value: number): FakeRow {
  recordSeq += 1
  return {
    id: fixtureId("record", recordSeq),
    item_id: fixtureId("item", itemN),
    value,
    recorded_at: recordedAt,
  }
}

/**
 * Two users. The owner has a three-level box chain with items at each level, an
 * empty box and a box with one bare item. Amounts are multiples of 0.25 so sums
 * are exact whatever order rows are added in.
 */
export function collectionFixture(): FakeTables {
  return {
    boxes: [
      box(BOX.shelf, OWNER, null),
      box(BOX.drawer, OWNER, BOX.shelf),
      box(BOX.tin, OWNER, BOX.drawer),
      box(BOX.empty, OWNER, null),
      box(BOX.plain, OWNER, null),
      box(BOX.strangers, STRANGER, null),
    ],
    items: [
      item(1, OWNER, BOX.shelf, {
        current_value: 100,
        acquisition_date: "2026-01-10",
        acquisition_price: 80,
      }),
      item(2, OWNER, BOX.drawer, {
        current_value: 50.5,
        acquisition_date: "2026-02-01",
        acquisition_price: 60.25,
      }),
      // No acquisition date: counted in the cost total, absent from the cost line.
      item(3, OWNER, BOX.tin, { current_value: 20, acquisition_price: 5 }),
      // Wishlist rows never count, wherever they point.
      item(4, OWNER, BOX.shelf, { current_value: 999, is_wishlist: true }),
      item(5, OWNER, BOX.plain, { current_value: 10 }),
      // Loose item at the root: in no box's stats.
      item(6, OWNER, null, { current_value: 7, acquisition_date: "2026-03-03", acquisition_price: 7 }),
      item(7, STRANGER, BOX.strangers, {
        current_value: 500,
        acquisition_date: "2026-01-01",
        acquisition_price: 400,
      }),
      // Hostile row: someone else's item claiming to sit in the owner's box.
      item(8, STRANGER, BOX.shelf, { current_value: 4000 }),
    ],
    value_history: [
      record(1, "2026-01-10T09:00:00+00:00", 80),
      record(1, "2026-03-01T10:30:00+00:00", 90),
      record(1, "2026-06-15T08:00:00+00:00", 100),
      record(2, "2026-02-01T12:00:00+00:00", 60.25),
      record(2, "2026-06-15T18:00:00+00:00", 50.5),
      record(4, "2026-04-04T00:00:00+00:00", 999),
      record(6, "2026-03-03T00:00:00+00:00", 7),
      record(7, "2026-01-01T00:00:00+00:00", 400),
      record(8, "2026-05-05T00:00:00+00:00", 4000),
    ],
  }
}

/** Deterministic pseudo-random numbers in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * A larger generated collection: `boxCount` owner boxes in a random tree (box 1
 * is the root of all of them) and `itemCount` items with irregular histories,
 * including items with no history, histories that start late, several records
 * on one day, and records dated after today.
 */
export function generatedCollection(seed: number, boxCount: number, itemCount: number): FakeTables {
  const random = seeded(seed)
  const pick = (n: number) => Math.floor(random() * n)
  const amount = () => pick(4000) / 4
  const day = (offset: number) => {
    const date = new Date(Date.UTC(2025, 0, 1) + offset * 86_400_000)
    return date.toISOString().slice(0, 10)
  }

  const boxes: FakeRow[] = []
  for (let b = 1; b <= boxCount; b++) {
    boxes.push(box(fixtureId("box", 100 + b), OWNER, b === 1 ? null : fixtureId("box", 100 + 1 + pick(b - 1))))
  }

  const items: FakeRow[] = []
  const history: FakeRow[] = []
  for (let i = 1; i <= itemCount; i++) {
    const n = 1000 + i
    items.push(
      item(n, OWNER, fixtureId("box", 100 + 1 + pick(boxCount)), {
        current_value: random() < 0.1 ? null : amount(),
        acquisition_date: random() < 0.3 ? null : day(pick(540)),
        acquisition_price: random() < 0.2 ? null : amount(),
      })
    )
    const recordCount = random() < 0.25 ? 0 : 1 + pick(6)
    for (let r = 0; r < recordCount; r++) {
      // Up to day 600: FIXTURE_TODAY is day 546, so some records are in the future.
      const hour = String(pick(24)).padStart(2, "0")
      history.push(record(n, `${day(pick(600))}T${hour}:15:00+00:00`, amount()))
    }
  }
  return { boxes, items, value_history: history }
}

export function generatedBoxId(n: number): string {
  return fixtureId("box", 100 + n)
}
