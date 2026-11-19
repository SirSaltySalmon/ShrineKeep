/**
 * A small in-memory stand-in for the Supabase query builder, for tests that
 * need real filtering instead of canned responses: `select` (with exact count
 * and column projection), `eq`, `in`, `is`, `order`, `range`, `single`.
 *
 * Like PostgREST it never returns more than `maxRows` rows per request, so
 * code that forgets to page shows up as missing data.
 *
 * It does not model RLS. Tests put other users' rows in the tables and check
 * that the code under test filters them out itself.
 */

export type FakeRow = Record<string, unknown>

export interface FakeTables {
  [table: string]: FakeRow[]
}

export interface FakeQueryCall {
  table: string
  columns: string
  filters: Array<{ op: "eq" | "in" | "is"; column: string; value: unknown }>
  range: [number, number] | null
  /** Whether the request asked for an exact row count. */
  exactCount: boolean
}

export interface FakeSupabaseOptions {
  /** `auth.getUser()` resolves to this user, or to no user when null. */
  userId?: string | null
  /** Per-request row cap. Supabase's default is 1000. */
  maxRows?: number
  /** Tables whose reads fail. */
  failTables?: string[]
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return (a as string | number) < (b as string | number) ? -1 : 1
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  private columns = "*"
  private wantCount = false
  private filters: FakeQueryCall["filters"] = []
  private orders: Array<{ column: string; ascending: boolean }> = []
  private window: [number, number] | null = null
  private one = false

  constructor(
    private readonly table: string,
    private readonly tables: FakeTables,
    private readonly options: Required<Pick<FakeSupabaseOptions, "maxRows" | "failTables">>,
    private readonly calls: FakeQueryCall[]
  ) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.columns = columns
    this.wantCount = opts?.count === "exact"
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value })
    return this
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value })
    return this
  }
  is(column: string, value: null) {
    this.filters.push({ op: "is", column, value })
    return this
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false })
    return this
  }
  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }
  single() {
    this.one = true
    return this
  }

  private run(): { data: unknown; error: unknown; count: number | null } {
    this.calls.push({
      table: this.table,
      columns: this.columns,
      filters: this.filters,
      range: this.window,
      exactCount: this.wantCount,
    })
    if (this.options.failTables.includes(this.table)) {
      return { data: null, error: { message: `${this.table} unavailable` }, count: null }
    }

    let rows = (this.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        const cell = row[filter.column]
        if (filter.op === "in") return (filter.value as unknown[]).includes(cell)
        if (filter.op === "is") return cell === null || cell === undefined
        return cell === filter.value
      })
    )
    if (this.orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const result = compare(a[column], b[column])
          if (result !== 0) return ascending ? result : -result
        }
        return 0
      })
    }
    const total = rows.length
    const [from, to] = this.window ?? [0, total - 1]
    rows = rows.slice(from, Math.min(to + 1, from + this.options.maxRows))

    const names = this.columns.split(",").map((name) => name.trim())
    const projected = names.includes("*")
      ? rows
      : rows.map((row) => {
          const picked: FakeRow = {}
          for (const name of names) picked[name] = row[name]
          return picked
        })

    if (this.one) {
      return projected.length === 1
        ? { data: projected[0], error: null, count: null }
        : { data: null, error: { message: "Expected a single row" }, count: null }
    }
    return { data: projected, error: null, count: this.wantCount ? total : null }
  }

  then<A = { data: unknown; error: unknown; count: number | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected)
  }
}

export function createFakeSupabase(tables: FakeTables, options: FakeSupabaseOptions = {}) {
  const calls: FakeQueryCall[] = []
  const resolved = {
    maxRows: options.maxRows ?? 1000,
    failTables: options.failTables ?? [],
  }
  const userId = options.userId === undefined ? null : options.userId
  const client = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => new FakeQuery(table, tables, resolved, calls),
  }
  return { client, calls }
}
