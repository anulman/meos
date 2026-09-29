// SPDX-License-Identifier: Apache-2.0
export type TimedItem = {instant: number; end?: number}
export type TimelineEntry<T> = {item: T} | {gap: {start: number; end: number}}

/** Input is chronological. Unknown durations do not imply available time. */
export function timelineWithGaps<T extends TimedItem>(items: readonly T[]): TimelineEntry<T>[] {
 const entries: TimelineEntry<T>[] = []
 let occupiedEnd: number | undefined
 let previousEndKnown = false
 for (const item of items) {
  if (previousEndKnown && occupiedEnd !== undefined && item.instant > occupiedEnd) {
   entries.push({gap: {start: occupiedEnd, end: item.instant}})
  }
  entries.push({item})
  // Retain the furthest end of overlapping/nested intervals. An unknown end
  // breaks the inference until a subsequent event supplies a known end.
  previousEndKnown = item.end !== undefined && Number.isFinite(item.end) && item.end >= item.instant
  if (previousEndKnown) occupiedEnd = Math.max(occupiedEnd ?? item.end!, item.end!)
 }
 return entries
}

export function timelineDuration(milliseconds: number): string {
 const minutes = Math.round(milliseconds / 60000)
 const hours = Math.floor(minutes / 60)
 return hours ? `${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`
}
