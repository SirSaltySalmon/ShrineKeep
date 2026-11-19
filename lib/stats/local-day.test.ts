import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { format } from "date-fns"
import { localDayEndMs, localDayStartMs } from "./local-day"

/** Run `body` with the process in `timeZone`, the way a browser in that zone would see dates. */
function describeIn(timeZone: string, body: () => void) {
  describe(timeZone, () => {
    const original = process.env.TZ
    beforeAll(() => {
      process.env.TZ = timeZone
    })
    afterAll(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })
    body()
  })
}

describe("local day helpers", () => {
  // West of UTC, east of UTC, and UTC itself.
  for (const timeZone of ["America/Los_Angeles", "Asia/Ho_Chi_Minh", "UTC"]) {
    describeIn(timeZone, () => {
      it("labels a stats date with the day it names", () => {
        expect(format(new Date(localDayStartMs("2026-03-01")), "MMM d, yyyy")).toBe("Mar 1, 2026")
        expect(format(new Date(localDayEndMs("2026-03-01")), "MMM d, yyyy")).toBe("Mar 1, 2026")
      })

      it("spans the whole local day", () => {
        expect(format(new Date(localDayStartMs("2026-12-31")), "yyyy-MM-dd HH:mm:ss.SSS")).toBe(
          "2026-12-31 00:00:00.000"
        )
        expect(format(new Date(localDayEndMs("2026-12-31")), "yyyy-MM-dd HH:mm:ss.SSS")).toBe(
          "2026-12-31 23:59:59.999"
        )
      })
    })
  }

  describeIn("America/Los_Angeles", () => {
    it("is not the UTC parse, which lands on the evening before", () => {
      expect(format(new Date("2026-03-01"), "MMM d")).toBe("Feb 28")
      expect(localDayStartMs("2026-03-01")).toBe(new Date("2026-03-01T08:00:00.000Z").getTime())
    })
  })

  it("is NaN for something that is not a date", () => {
    expect(localDayStartMs("")).toBeNaN()
    expect(localDayEndMs("not-a-date")).toBeNaN()
  })
})
