/** Dos intervalos [start, end) en minutos del mismo día se solapan si comparten tiempo. */
export function minuteRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd
}
