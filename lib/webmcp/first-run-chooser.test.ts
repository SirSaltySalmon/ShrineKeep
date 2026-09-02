import { describe, expect, it } from "vitest"
import { chooseFirstRun, FIRST_RUN_CHECK_TIMEOUT_MS } from "./first-run-chooser"

describe("chooseFirstRun", () => {
  it("shows nothing when dismissed", () => {
    expect(
      chooseFirstRun({
        dismissed: true,
        coachTools: ["checking", "checking", "checking"],
        elapsedMs: 0,
      })
    ).toBe("none")
  })

  it("waits while coach tools are checking, then still shows the tutorial after timeout", () => {
    expect(
      chooseFirstRun({
        dismissed: false,
        coachTools: ["checking", "ready", "checking"],
        elapsedMs: 0,
      })
    ).toBe("wait")
    expect(
      chooseFirstRun({
        dismissed: false,
        coachTools: ["checking", "checking", "checking"],
        elapsedMs: FIRST_RUN_CHECK_TIMEOUT_MS,
      })
    ).toBe("coach")
  })

  it("shows the tutorial whether tools are ready or unsupported", () => {
    expect(
      chooseFirstRun({
        dismissed: false,
        coachTools: ["ready", "ready", "ready"],
        elapsedMs: 0,
      })
    ).toBe("coach")
    expect(
      chooseFirstRun({
        dismissed: false,
        coachTools: ["unsupported", "unsupported", "unsupported"],
        elapsedMs: 0,
      })
    ).toBe("coach")
  })
})
