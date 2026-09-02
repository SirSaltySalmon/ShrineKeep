export const COACH_STORAGE_KEY = "sk.webmcpCoach.v1"

export const INIT_TOOL = "stage_collection_initialization"
export const PRICE_TOOLS = ["stage_item_edits", "stage_wishlist_edits"] as const

export type CoachStep =
  | "ask_name"
  | "copy_init"
  | "wait_init_approve"
  | "open_box"
  | "copy_prices"
  | "wait_price_approve"
  | "done"

export type CoachEvent =
  | { type: "set_name"; name: string }
  | { type: "tool_start"; name: string }
  | { type: "apply_success"; sourceTool: string; boxId: string | null; appliedCount: number }
  | { type: "box_opened"; boxId: string | null }
  | { type: "skip_step"; boxId: string | null; name?: string }

export interface CoachState {
  userId: string
  step: CoachStep
  collectionName: string
  createdBoxId: string | null
  createdBoxName: string | null
}

export function initialCoachState(userId: string): CoachState {
  return {
    userId,
    step: "ask_name",
    collectionName: "",
    createdBoxId: null,
    createdBoxName: null,
  }
}

export function parseCoachState(raw: string | null, userId: string): CoachState {
  if (!raw) return initialCoachState(userId)
  try {
    const parsed = JSON.parse(raw) as Partial<CoachState>
    if (parsed.userId !== userId) return initialCoachState(userId)
    return {
      userId,
      step: parsed.step ?? "ask_name",
      collectionName: typeof parsed.collectionName === "string" ? parsed.collectionName : "",
      createdBoxId: parsed.createdBoxId ?? null,
      createdBoxName: parsed.createdBoxName ?? null,
    }
  } catch {
    return initialCoachState(userId)
  }
}

export function reduceCoach(state: CoachState, event: CoachEvent): CoachState {
  if (state.step === "done") return state

  if (event.type === "set_name") {
    const name = event.name.trim().slice(0, 200)
    if (!name || state.step !== "ask_name") return state
    return { ...state, collectionName: name, createdBoxName: name, step: "copy_init" }
  }

  if (event.type === "tool_start") {
    if (state.step === "copy_init" && event.name === INIT_TOOL) {
      return { ...state, step: "wait_init_approve" }
    }
    if (
      state.step === "copy_prices" &&
      PRICE_TOOLS.includes(event.name as (typeof PRICE_TOOLS)[number])
    ) {
      return { ...state, step: "wait_price_approve" }
    }
    return state
  }

  if (event.type === "apply_success") {
    if (
      state.step === "wait_init_approve" &&
      event.sourceTool === INIT_TOOL &&
      event.boxId
    ) {
      return {
        ...state,
        createdBoxId: event.boxId,
        step: "open_box",
      }
    }
    if (
      state.step === "wait_price_approve" &&
      PRICE_TOOLS.includes(event.sourceTool as (typeof PRICE_TOOLS)[number]) &&
      event.appliedCount > 0
    ) {
      return { ...state, step: "done" }
    }
    return state
  }

  if (event.type === "box_opened") {
    if (state.createdBoxId) {
      if (event.boxId === state.createdBoxId) {
        if (state.step === "open_box") return { ...state, step: "copy_prices" }
        return state
      }
      if (state.step === "copy_prices" || state.step === "wait_price_approve") {
        return { ...state, step: "open_box" }
      }
      return state
    }
    if (state.step === "open_box" && event.boxId) {
      return { ...state, step: "copy_prices" }
    }
    if ((state.step === "copy_prices" || state.step === "wait_price_approve") && !event.boxId) {
      return { ...state, step: "open_box" }
    }
    return state
  }

  if (event.type === "skip_step") {
    const named =
      state.collectionName ||
      (typeof event.name === "string" ? event.name.trim().slice(0, 200) : "")
    if (state.step === "ask_name" || state.step === "copy_init" || state.step === "wait_init_approve") {
      if (state.createdBoxId) return { ...state, step: "open_box" }
      return {
        ...state,
        collectionName: named || state.collectionName,
        createdBoxName: state.createdBoxName ?? (named || null),
        createdBoxId: null,
        step: event.boxId ? "copy_prices" : "open_box",
      }
    }
    if (state.step === "open_box") {
      if (!state.createdBoxId && !event.boxId) return state
      return { ...state, step: "copy_prices" }
    }
    if (state.step === "copy_prices" || state.step === "wait_price_approve") {
      return { ...state, step: "done" }
    }
    return state
  }

  return state
}

export function initPrompt(collectionName: string): string {
  return [
    "Via ShrineKeep WebMCP in this browser,",
    `Set up a new box for my ${collectionName} collection`,
    "Research a real matched set, show it to me in chat, wait for my confirmation,",
    "then call stage_collection_initialization with user_confirmed_match true.",
  ].join("\n")
}

export function valuationPrompt(): string {
  return [
    "Via ShrineKeep WebMCP in this browser,",
    "Update the valuation of my owned items in this box.",
    "Use stage_item_edits, set valuation from typical recent secondhand sold prices.",
    "(If user has no owned items, skip this step)"
  ].join("\n")
}

export function openBoxLabel(name: string | null | undefined): string {
  const trimmed = typeof name === "string" ? name.trim() : ""
  return trimmed || "your created box"
}
