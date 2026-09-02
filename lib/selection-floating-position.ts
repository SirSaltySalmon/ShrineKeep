const DEFAULT_BOTTOM_OFFSET = 24
const SELECTION_ACTION_BAR_HEIGHT = 60
const SELECTION_ACTION_BAR_GAP = 12

export function selectionFloatingBottomOffset(actionBarVisible: boolean) {
  return actionBarVisible
    ? SELECTION_ACTION_BAR_HEIGHT + SELECTION_ACTION_BAR_GAP
    : DEFAULT_BOTTOM_OFFSET
}
