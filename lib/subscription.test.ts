import { describe, expect, it } from "vitest"
import {
  PAST_DUE_GRACE_DAYS,
  addPastDueGraceDays,
  formatProMonthlyUsd,
  getPastDueGraceEndsAt,
  proUpgradeCtaLabel,
} from "./subscription"

describe("subscription helpers", () => {
  it("formats pro monthly price consistently", () => {
    expect(formatProMonthlyUsd()).toBe("$4.99")
    expect(proUpgradeCtaLabel()).toContain("$4.99/month")
  })

  it("calculates grace date from current period end", () => {
    const periodEnd = new Date("2026-01-10T00:00:00.000Z")
    const graceEnd = addPastDueGraceDays(periodEnd)

    expect(graceEnd.toISOString()).toBe("2026-01-17T00:00:00.000Z")
    expect(PAST_DUE_GRACE_DAYS).toBe(7)
  })

  it("returns null for non past_due statuses", () => {
    const periodEnd = new Date("2026-01-10T00:00:00.000Z")

    expect(getPastDueGraceEndsAt("active", periodEnd)).toBeNull()
    expect(getPastDueGraceEndsAt(null, periodEnd)).toBeNull()
    expect(getPastDueGraceEndsAt("past_due", null)).toBeNull()
  })
})
