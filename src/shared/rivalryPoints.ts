const rivalryPointsFormatter = new Intl.NumberFormat("en-US");

/**
 * Rivalry Points are the player-facing name for the existing server-owned
 * `credits` balance. Keeping this formatter at the presentation boundary lets
 * the database and economy contracts remain backward compatible.
 */
export function formatRivalryPoints(amount: number): string {
  return `${rivalryPointsFormatter.format(amount)} RP`;
}

export function rivalryPointsLabel(amount: number): string {
  return `${rivalryPointsFormatter.format(amount)} Rivalry Points`;
}
