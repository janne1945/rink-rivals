const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Progression periods require a valid date.');
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Returns the calendar day for the device's local time zone. */
export function getLocalDayKey(date: Date): string {
  assertValidDate(date);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Returns the local calendar date of the Monday starting the containing week.
 * Calendar arithmetic is performed at noon so DST boundaries cannot skip a day.
 */
export function getLocalWeekKey(date: Date): string {
  assertValidDate(date);
  const dayOffsetFromMonday = (date.getDay() + 6) % 7;
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - dayOffsetFromMonday,
    12,
  );
  return getLocalDayKey(monday);
}

/** Stable local-calendar ordinal used for the rotating daily spotlight. */
export function getLocalDayOrdinal(date: Date): number {
  assertValidDate(date);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      DAY_IN_MILLISECONDS,
  );
}
