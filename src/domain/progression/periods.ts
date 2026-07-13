const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Progression periods require a valid date.');
  }
}

/** Returns the authoritative UTC calendar day. */
export function getUtcDayKey(date: Date): string {
  assertValidDate(date);
  return date.toISOString().slice(0, 10);
}

/** Returns the UTC Monday starting the containing week. */
export function getUtcWeekKey(date: Date): string {
  assertValidDate(date);
  const dayOffsetFromMonday = (date.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - dayOffsetFromMonday,
  ));
  return getUtcDayKey(monday);
}

/** Stable UTC-calendar ordinal used for the rotating daily spotlight. */
export function getUtcDayOrdinal(date: Date): number {
  assertValidDate(date);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      DAY_IN_MILLISECONDS,
  );
}
