export interface ServerClockAnchor {
  readonly monotonicTime: number;
  readonly serverTime: number;
}

function requireFiniteTime(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

/**
 * Anchors a server timestamp to a monotonic browser clock. Wall time is read
 * only once as a defensive fallback when the server value is malformed.
 */
export function createServerClockAnchor(
  serverTime: string,
  monotonicTime: number,
  fallbackWallTime: number,
): ServerClockAnchor {
  const parsedServerTime = Date.parse(serverTime);
  return {
    monotonicTime: requireFiniteTime(monotonicTime, "Monotonic time"),
    serverTime: Number.isFinite(parsedServerTime)
      ? parsedServerTime
      : requireFiniteTime(fallbackWallTime, "Fallback wall time"),
  };
}

/** Returns the anchored server timestamp after monotonic elapsed time. */
export function serverTimestampAt(anchor: ServerClockAnchor, monotonicTime: number): number {
  const elapsed = Math.max(
    0,
    requireFiniteTime(monotonicTime, "Monotonic time") - anchor.monotonicTime,
  );
  return anchor.serverTime + elapsed;
}
