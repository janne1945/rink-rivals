/**
 * Reviewed 68-OVR floor cases. Each official team has no other valid-position
 * depth option after protected stars are excluded. Their Starter attributes
 * must still be strictly weaker than Base.
 */
export const STARTER_OVR_FLOOR_EXCEPTION_PLAYER_IDS = [
  'nhl-michael-dipietro',
  'nhl-arttu-hyry',
  'nhl-max-jones',
  'nhl-garnet-hathaway',
  'nhl-nils-hoglander',
  'nhl-brandon-duhaime',
] as const;

export const STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET: ReadonlySet<string> =
  new Set(STARTER_OVR_FLOOR_EXCEPTION_PLAYER_IDS);
