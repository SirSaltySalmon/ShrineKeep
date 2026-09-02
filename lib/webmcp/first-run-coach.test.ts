import { describe, expect, it } from "vitest"
import {
  INIT_TOOL,
  initialCoachState,
  openBoxLabel,
  parseCoachState,
  reduceCoach,
  valuationPrompt,
} from "./first-run-coach"

describe("reduceCoach", () => {
  it("advances name, init tool, apply with box id, open box, price tool, priced apply", () => {
    let state = initialCoachState("u1")
    state = reduceCoach(state, { type: "set_name", name: "  Pokemon  " })
    expect(state.step).toBe("copy_init")
    expect(state.collectionName).toBe("Pokemon")
    state = reduceCoach(state, { type: "tool_start", name: INIT_TOOL })
    expect(state.step).toBe("wait_init_approve")
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: INIT_TOOL,
      boxId: "box-1",
      appliedCount: 3,
    })
    expect(state).toMatchObject({ step: "open_box", createdBoxId: "box-1" })
    state = reduceCoach(state, { type: "box_opened", boxId: "box-1" })
    expect(state.step).toBe("copy_prices")
    state = reduceCoach(state, { type: "tool_start", name: "stage_item_edits" })
    expect(state.step).toBe("wait_price_approve")
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: "stage_item_edits",
      boxId: "box-1",
      appliedCount: 2,
    })
    expect(state.step).toBe("done")
  })

  it("ignores the wrong create-items tool and empty price applies", () => {
    let state = initialCoachState("u1")
    state = reduceCoach(state, { type: "set_name", name: "Lego" })
    state = reduceCoach(state, { type: "tool_start", name: "stage_items_in_current_box" })
    expect(state.step).toBe("copy_init")
    state = reduceCoach(state, { type: "tool_start", name: INIT_TOOL })
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: INIT_TOOL,
      boxId: null,
      appliedCount: 1,
    })
    expect(state.step).toBe("wait_init_approve")
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: INIT_TOOL,
      boxId: "box-1",
      appliedCount: 1,
    })
    state = reduceCoach(state, { type: "box_opened", boxId: "other" })
    expect(state.step).toBe("open_box")
    state = reduceCoach(state, { type: "box_opened", boxId: "box-1" })
    state = reduceCoach(state, { type: "tool_start", name: "stage_wishlist_edits" })
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: "stage_wishlist_edits",
      boxId: "box-1",
      appliedCount: 0,
    })
    expect(state.step).toBe("wait_price_approve")
  })

  it("returns to open-box when the user leaves the created box", () => {
    let state = initialCoachState("u1")
    state = reduceCoach(state, { type: "set_name", name: "Lego" })
    state = reduceCoach(state, { type: "tool_start", name: INIT_TOOL })
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: INIT_TOOL,
      boxId: "box-1",
      appliedCount: 1,
    })
    state = reduceCoach(state, { type: "box_opened", boxId: "box-1" })
    expect(state.step).toBe("copy_prices")
    state = reduceCoach(state, { type: "box_opened", boxId: null })
    expect(state.step).toBe("open_box")
    state = reduceCoach(state, { type: "box_opened", boxId: "box-1" })
    state = reduceCoach(state, { type: "tool_start", name: "stage_item_edits" })
    expect(state.step).toBe("wait_price_approve")
    state = reduceCoach(state, { type: "box_opened", boxId: "other" })
    expect(state.step).toBe("open_box")
  })

  it("skips the current tutorial part without ending the coach", () => {
    let state = initialCoachState("u1")
    state = reduceCoach(state, { type: "skip_step", boxId: "box-now", name: "  Lego  " })
    expect(state).toMatchObject({
      step: "copy_prices",
      createdBoxId: null,
      createdBoxName: "Lego",
    })
    state = reduceCoach(state, { type: "skip_step", boxId: "box-now" })
    expect(state.step).toBe("done")

    state = initialCoachState("u1")
    state = reduceCoach(state, { type: "set_name", name: "Lego" })
    state = reduceCoach(state, { type: "tool_start", name: INIT_TOOL })
    state = reduceCoach(state, {
      type: "apply_success",
      sourceTool: INIT_TOOL,
      boxId: "box-1",
      appliedCount: 1,
    })
    expect(state.step).toBe("open_box")
    state = reduceCoach(state, { type: "skip_step", boxId: null })
    expect(state.step).toBe("copy_prices")
    state = reduceCoach(state, { type: "tool_start", name: "stage_item_edits" })
    state = reduceCoach(state, { type: "skip_step", boxId: "box-1" })
    expect(state.step).toBe("done")
  })

  it("continues valuation in any non-root box when creation was skipped", () => {
    let state = initialCoachState("u1")
    state = reduceCoach(state, { type: "skip_step", boxId: null })
    expect(state).toMatchObject({ step: "open_box", createdBoxId: null })
    state = reduceCoach(state, { type: "box_opened", boxId: "box-a" })
    expect(state.step).toBe("copy_prices")
    state = reduceCoach(state, { type: "box_opened", boxId: "box-b" })
    expect(state.step).toBe("copy_prices")
    state = reduceCoach(state, { type: "box_opened", boxId: null })
    expect(state.step).toBe("open_box")
    state = reduceCoach(state, { type: "box_opened", boxId: "box-c" })
    expect(state.step).toBe("copy_prices")
  })

  it("labels an unnamed skipped box as your created box", () => {
    expect(openBoxLabel("")).toBe("your created box")
    expect(openBoxLabel("   ")).toBe("your created box")
    expect(openBoxLabel(null)).toBe("your created box")
    expect(openBoxLabel("Lego")).toBe("Lego")
  })

  it("asks for valuation updates instead of purchase-price research", () => {
    expect(valuationPrompt()).toContain("current_value")
    expect(valuationPrompt()).not.toContain("retail prices")
  })

  it("resets stored state when the user id does not match", () => {
    const raw = JSON.stringify({
      userId: "old",
      step: "copy_prices",
      collectionName: "x",
      createdBoxId: "b",
      createdBoxName: "x",
    })
    expect(parseCoachState(raw, "new").step).toBe("ask_name")
    expect(parseCoachState("not-json", "u1").step).toBe("ask_name")
  })
})
