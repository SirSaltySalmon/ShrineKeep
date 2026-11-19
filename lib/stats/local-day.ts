import { endOfDay, parseISO } from "date-fns"

/**
 * A stats date (`YYYY-MM-DD`) on a time axis that is labelled in local time.
 *
 * `new Date("2026-03-01")` is midnight UTC, which west of UTC is still the evening of
 * Feb 28, so a tick or tooltip formatted in local time would read a day early. These place
 * the day on the viewer's own calendar instead, so it is labelled with the date it names.
 */

/** Local midnight at the start of the day, in ms. NaN when `date` is not a date. */
export function localDayStartMs(date: string): number {
  return parseISO(date).getTime()
}

/** The last millisecond of the local day. NaN when `date` is not a date. */
export function localDayEndMs(date: string): number {
  return endOfDay(parseISO(date)).getTime()
}
