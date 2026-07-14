import type {
  GoalieAttributes,
  HockeyPosition,
  SkaterAttributes,
} from '../../src/domain/cards/types';

export const SIGNATURE_SKATER_RATING_LABELS = ['SPD', 'SHT', 'PLY', 'DEF', 'CLT'] as const;
export const SIGNATURE_GOALIE_RATING_LABELS = ['HGH', 'LOW', 'QCK', 'POS', 'RBC'] as const;

export type SignatureSkaterRatingLabel = (typeof SIGNATURE_SKATER_RATING_LABELS)[number];
export type SignatureGoalieRatingLabel = (typeof SIGNATURE_GOALIE_RATING_LABELS)[number];

interface SignatureArtworkBase {
  readonly position: HockeyPosition;
  readonly overall: number;
}

export interface SignatureSkaterArtwork extends SignatureArtworkBase {
  readonly role: 'skater';
  readonly position: Exclude<HockeyPosition, 'G'>;
  readonly displayedRatings: Readonly<Record<SignatureSkaterRatingLabel, number>>;
}

export interface SignatureGoalieArtwork extends SignatureArtworkBase {
  readonly role: 'goalie';
  readonly position: 'G';
  readonly displayedRatings: Readonly<Record<SignatureGoalieRatingLabel, number>>;
}

export type SignatureArtwork = SignatureSkaterArtwork | SignatureGoalieArtwork;

function isRating(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 40 && Number(value) <= 99;
}

function exactRatingRecord(
  value: unknown,
  labels: readonly string[],
): value is Readonly<Record<string, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length === labels.length
    && entries.every(([label, rating]) => labels.includes(label) && isRating(rating));
}

export function parseSignatureArtwork(value: unknown): SignatureArtwork {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Signature artwork metadata must be an object.');
  }
  const artwork = value as Record<string, unknown>;
  if (!isRating(artwork.overall)) {
    throw new TypeError('Signature artwork OVR must be an integer from 40 through 99.');
  }
  if (artwork.role === 'skater'
    && typeof artwork.position === 'string'
    && ['LW', 'C', 'RW', 'LD', 'RD'].includes(artwork.position)
    && exactRatingRecord(artwork.displayedRatings, SIGNATURE_SKATER_RATING_LABELS)) {
    return artwork as unknown as SignatureSkaterArtwork;
  }
  if (artwork.role === 'goalie'
    && artwork.position === 'G'
    && exactRatingRecord(artwork.displayedRatings, SIGNATURE_GOALIE_RATING_LABELS)) {
    return artwork as unknown as SignatureGoalieArtwork;
  }
  throw new TypeError('Signature artwork role, position, or displayed rating labels are invalid.');
}

/**
 * Signature artwork exposes five abbreviated ratings while the battle engine
 * requires eight role-specific attributes. Displayed values map one-to-one to
 * their matching gameplay attributes. Non-displayed fields reuse the closest
 * visible category deterministically: skater control/IQ use PLY and physicality
 * uses DEF; goalie puck handling uses RBC and consistency/clutch use POS.
 */
export function signatureArtworkAttributes(
  artwork: SignatureSkaterArtwork,
): SkaterAttributes;
export function signatureArtworkAttributes(
  artwork: SignatureGoalieArtwork,
): GoalieAttributes;
export function signatureArtworkAttributes(
  artwork: SignatureArtwork,
): SkaterAttributes | GoalieAttributes;
export function signatureArtworkAttributes(
  artwork: SignatureArtwork,
): SkaterAttributes | GoalieAttributes {
  if (artwork.role === 'goalie') {
    return {
      reflexes: artwork.displayedRatings.QCK,
      positioning: artwork.displayedRatings.POS,
      glove: artwork.displayedRatings.HGH,
      blocker: artwork.displayedRatings.LOW,
      reboundControl: artwork.displayedRatings.RBC,
      puckHandling: artwork.displayedRatings.RBC,
      consistency: artwork.displayedRatings.POS,
      clutch: artwork.displayedRatings.POS,
    };
  }
  return {
    speed: artwork.displayedRatings.SPD,
    shooting: artwork.displayedRatings.SHT,
    passing: artwork.displayedRatings.PLY,
    puckControl: artwork.displayedRatings.PLY,
    defense: artwork.displayedRatings.DEF,
    physicality: artwork.displayedRatings.DEF,
    hockeyIq: artwork.displayedRatings.PLY,
    clutch: artwork.displayedRatings.CLT,
  };
}
