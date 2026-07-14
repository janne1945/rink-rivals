import { z } from 'zod';

import {
  CARD_IMAGE_REFERENCE_PATTERN,
  createCardImageReference,
} from '../domain/cards/assets';
import type { CardCatalog, ContentCatalog } from '../domain/cards/types';
import { STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET } from './starterFloorExceptions';

export const leagueSchema = z.enum(['NHL', 'PWHL']);
export const lineupSlotSchema = z.enum(['LW', 'C', 'RW', 'LD', 'RD', 'G']);
export const handednessSchema = z.enum(['left', 'right', 'unknown']);
export const cardTypeSchema = z.enum(['starter', 'base', 'event', 'reward']);
export const cardTierSchema = z.enum(['starter', 'standard', 'featured', 'elite', 'signature']);
export const marketAvailabilitySchema = z.enum([
  'unavailable', 'base-market', 'event-shop', 'reward-only',
]);

const stableIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a stable lowercase kebab-case ID');
const snapshotDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceRosterStatusSchema = z.enum(['active-roster', 'roster-candidate', 'rights', 'legacy-retained']);
const positionSourceSchema = z.enum([
  'official-exact',
  'derived-from-official-position-and-handedness',
  'derived-from-generic-official-position',
]);

export const sourceMetadataSchema = z.object({
  provider: z.enum(['nhl-api', 'nhl-official', 'pwhl-hockeytech', 'pwhl-draft', 'legacy-catalog', 'manual-import']),
  sourceIds: z.array(z.string().trim().min(1)).min(1),
  sourceUrls: z.array(z.string().url()).min(1),
  snapshotDate: snapshotDateSchema,
  rosterSeason: z.string().trim().min(2),
  statsSeason: z.string().trim().min(2).nullable(),
  sourceRosterStatus: sourceRosterStatusSchema,
  positionSource: positionSourceSchema,
  requiresManualReview: z.boolean(),
  manualReviewReasons: z.array(z.string().trim().min(8)),
}).superRefine((metadata, context) => {
  if (metadata.requiresManualReview && metadata.manualReviewReasons.length === 0) {
    context.addIssue({ code: 'custom', message: 'Manual review requires at least one reason' });
  }
  if (!metadata.requiresManualReview && metadata.manualReviewReasons.length > 0) {
    context.addIssue({ code: 'custom', message: 'Manual review reasons require the review flag' });
  }
});

export const teamSchema = z.object({
  id: stableIdSchema,
  name: z.string().trim().min(2),
  abbreviation: z.string().trim().min(2).max(5),
  league: leagueSchema,
  active: z.literal(true),
  visualMetadata: z.object({
    treatment: z.literal('neutral-unlicensed'),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    abbreviation: z.string().trim().min(2).max(5),
  }),
  sourceMetadata: z.object({
    provider: z.enum(['nhl-api', 'pwhl-hockeytech']),
    sourceId: z.string().trim().min(1),
    sourceUrl: z.string().url(),
    snapshotDate: snapshotDateSchema,
    rosterSeason: z.string().trim().min(2),
  }),
});

const commonPlayerSchema = z.object({
  id: stableIdSchema,
  name: z.string().trim().min(2),
  league: leagueSchema,
  currentTeamId: stableIdSchema,
  team: z.string().trim().min(2),
  nationality: z.string().regex(/^[A-Z]{3}$/, 'Nationality must be an ISO-3 code').nullable(),
  archetype: z.string().trim().min(2),
  primaryPosition: lineupSlotSchema,
  eligiblePositions: z.array(lineupSlotSchema).min(1),
  handedness: handednessSchema,
  active: z.boolean(),
  imageReference: z.string().startsWith('placeholder:'),
  sourceMetadata: sourceMetadataSchema,
});

export const skaterPlayerSchema = commonPlayerSchema.extend({
  role: z.literal('skater'),
  primaryPosition: z.enum(['LW', 'C', 'RW', 'LD', 'RD']),
  eligiblePositions: z.array(z.enum(['LW', 'C', 'RW', 'LD', 'RD'])).min(1),
});

export const goaliePlayerSchema = commonPlayerSchema.extend({
  role: z.literal('goalie'),
  primaryPosition: z.literal('G'),
  eligiblePositions: z.tuple([z.literal('G')]),
});

export const playerSchema = z.discriminatedUnion('role', [skaterPlayerSchema, goaliePlayerSchema]);

const ratingSchema = z.number().int().min(40).max(99);
export const skaterAttributesSchema = z.object({
  speed: ratingSchema,
  shooting: ratingSchema,
  passing: ratingSchema,
  puckControl: ratingSchema,
  defense: ratingSchema,
  physicality: ratingSchema,
  hockeyIq: ratingSchema,
  clutch: ratingSchema,
});
export const goalieAttributesSchema = z.object({
  reflexes: ratingSchema,
  positioning: ratingSchema,
  glove: ratingSchema,
  blocker: ratingSchema,
  reboundControl: ratingSchema,
  puckHandling: ratingSchema,
  consistency: ratingSchema,
  clutch: ratingSchema,
});

const commonCardSchema = z.object({
  id: stableIdSchema,
  playerId: stableIdSchema,
  teamId: stableIdSchema,
  setId: stableIdSchema,
  cardType: cardTypeSchema,
  cardTier: cardTierSchema,
  overall: ratingSchema,
  abilities: z.array(z.string().trim().min(2)).max(3),
  price: z.number().int().nonnegative(),
  marketAvailability: marketAvailabilitySchema,
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().optional(),
  isPermanent: z.boolean(),
  imageReference: z.string().regex(
    CARD_IMAGE_REFERENCE_PATTERN,
    'Use a semantic player-asset reference instead of a file path',
  ),
  visualMetadata: z.object({
    treatment: z.enum(['neutral-placeholder', 'approved-local-asset']),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    frame: cardTierSchema,
  }),
});

export const skaterCardSchema = commonCardSchema.extend({
  role: z.literal('skater'),
  attributes: skaterAttributesSchema,
});
export const goalieCardSchema = commonCardSchema.extend({
  role: z.literal('goalie'),
  attributes: goalieAttributesSchema,
});
export const cardVersionSchema = z.discriminatedUnion('role', [skaterCardSchema, goalieCardSchema]);

export const starterSquadSchema = z.object({
  teamId: stableIdSchema,
  cards: z.array(stableIdSchema).length(6),
  lineup: z.object({
    LW: stableIdSchema, C: stableIdSchema, RW: stableIdSchema,
    LD: stableIdSchema, RD: stableIdSchema, G: stableIdSchema,
  }),
  averageOverall: z.literal(72),
  validationMetadata: z.object({
    excludedTopBasePlayerIds: z.array(stableIdSchema).min(3),
    sourceRosterStatuses: z.array(sourceRosterStatusSchema).min(1),
    requiresManualReview: z.boolean(),
    manualReviewReasons: z.array(z.string().trim().min(8)),
  }),
});

export const catalogMetadataSchema = z.object({
  catalogId: stableIdSchema,
  generatedAt: z.string().datetime(),
  snapshotDate: snapshotDateSchema,
  sourceWindow: z.array(z.string().trim().min(2)).min(1).max(4),
  disclaimer: z.string().min(20),
  requiresManualApproval: z.literal(true),
});

function validateCardContract(card: z.infer<typeof cardVersionSchema>, context: z.RefinementCtx): void {
  const hasWindow = Boolean(card.availableFrom && card.availableTo);
  if (card.availableFrom && card.availableTo && Date.parse(card.availableFrom) >= Date.parse(card.availableTo)) {
    context.addIssue({ code: 'custom', message: 'availableFrom must be earlier than availableTo' });
  }
  if (card.cardType === 'starter') {
    if (card.overall < 68 || card.overall > 76) context.addIssue({ code: 'custom', message: 'Starter overall must be 68-76' });
    if (card.cardTier !== 'starter' || card.marketAvailability !== 'unavailable' || card.price !== 0 || !card.isPermanent || hasWindow) {
      context.addIssue({ code: 'custom', message: 'Starter cards must be permanent, free, starter-tier, and unavailable in markets' });
    }
  }
  if (card.cardType === 'base') {
    if (card.overall < 68 || card.overall > 86) context.addIssue({ code: 'custom', message: 'Base overall must be 68-86' });
    if (card.cardTier !== 'standard' || card.marketAvailability !== 'base-market' || card.price <= 0 || !card.isPermanent || hasWindow) {
      context.addIssue({ code: 'custom', message: 'Base cards must be permanent standard Base Market inventory' });
    }
  }
  if (card.cardType === 'event') {
    if (card.overall < 84 || card.overall > 90) context.addIssue({ code: 'custom', message: 'Launch event overall must be 84-90' });
    if (card.cardTier === 'starter' || card.cardTier === 'standard' || card.marketAvailability !== 'event-shop' || card.price <= 0 || card.isPermanent || !hasWindow) {
      context.addIssue({ code: 'custom', message: 'Event cards require a rotating Event Shop window and event tier' });
    }
  }
  if (card.cardType === 'reward') {
    if (card.overall > 90) context.addIssue({ code: 'custom', message: 'Launch reward overall cannot exceed 90' });
    if (card.cardTier === 'starter' || card.cardTier === 'standard' || card.marketAvailability !== 'reward-only' || card.price !== 0 || !card.isPermanent || hasWindow) {
      context.addIssue({ code: 'custom', message: 'Reward cards must be permanent, windowless, free reward-only versions and never market inventory' });
    }
  }
  if (card.visualMetadata.frame !== card.cardTier) {
    context.addIssue({ code: 'custom', message: 'Visual frame must match cardTier' });
  }
}

export const catalogSchema = z.object({
  metadata: catalogMetadataSchema,
  teams: z.array(teamSchema).default([]),
  players: z.array(playerSchema),
  cards: z.array(cardVersionSchema),
  starterSquads: z.array(starterSquadSchema).default([]),
}).superRefine((catalog, context) => {
  const duplicate = (values: readonly string[]): string[] => values.filter((value, index) => values.indexOf(value) !== index);
  for (const id of new Set(duplicate(catalog.teams.map(({ id }) => id)))) context.addIssue({ code: 'custom', message: `Duplicate team ID: ${id}` });
  for (const id of new Set(duplicate(catalog.players.map(({ id }) => id)))) context.addIssue({ code: 'custom', message: `Duplicate player ID: ${id}` });
  for (const id of new Set(duplicate(catalog.cards.map(({ id }) => id)))) context.addIssue({ code: 'custom', message: `Duplicate card ID: ${id}` });
  for (const reference of new Set(duplicate(catalog.cards.map(({ imageReference }) => imageReference)))) {
    context.addIssue({ code: 'custom', message: `Duplicate card image reference: ${reference}` });
  }
  for (const id of new Set(duplicate(catalog.starterSquads.map(({ teamId }) => teamId)))) context.addIssue({ code: 'custom', message: `Duplicate StarterSquad team ID: ${id}` });

  if (catalog.teams.some((team) => team.id.startsWith('pwhl-pwhl-'))) {
    context.addIssue({ code: 'custom', message: 'PWHL team IDs must not repeat the league prefix' });
  }

  const teams = new Map(catalog.teams.map((team) => [team.id, team]));
  const players = new Map(catalog.players.map((player) => [player.id, player]));
  const cards = new Map(catalog.cards.map((card) => [card.id, card]));

  for (const card of catalog.cards) {
    const expected = createCardImageReference(card.playerId, card.cardType, card.id);
    if (card.imageReference !== expected) {
      context.addIssue({
        code: 'custom',
        message: `${card.id} must use semantic image reference ${expected}`,
      });
    }
  }
  const baseByPlayer = new Map(catalog.cards
    .filter((card) => card.cardType === 'base')
    .map((card) => [card.playerId, card]));
  for (const player of catalog.players) {
    const team = teams.get(player.currentTeamId);
    if (catalog.teams.length > 0 && (!team || team.league !== player.league || team.name !== player.team)) {
      context.addIssue({ code: 'custom', message: `${player.id} has an invalid current team reference` });
    }
    if (!player.eligiblePositions.includes(player.primaryPosition as never)) {
      context.addIssue({ code: 'custom', message: `${player.id} primaryPosition is not eligible` });
    }
    if (player.sourceMetadata.sourceRosterStatus === 'rights' && !player.sourceMetadata.requiresManualReview) {
      context.addIssue({ code: 'custom', message: `${player.id} draft rights require manual review` });
    }
    if (player.sourceMetadata.sourceRosterStatus === 'roster-candidate'
      && !player.sourceMetadata.requiresManualReview) {
      context.addIssue({ code: 'custom', message: `${player.id} roster candidate requires manual review` });
    }
    if (player.sourceMetadata.sourceRosterStatus === 'legacy-retained'
      && (player.active || !player.sourceMetadata.requiresManualReview)) {
      context.addIssue({ code: 'custom', message: `${player.id} legacy-retained identity must be inactive and require manual review` });
    }
    if (player.sourceMetadata.sourceRosterStatus !== 'legacy-retained' && !player.active) {
      context.addIssue({ code: 'custom', message: `${player.id} current roster/rights identity must be active` });
    }
  }
  for (const card of catalog.cards) {
    validateCardContract(card, context);
    const player = players.get(card.playerId);
    const cardTeam = teams.get(card.teamId);
    const requiresCurrentTeam = card.cardType === 'starter' || card.cardType === 'base';
    if (!player || player.role !== card.role || !cardTeam || cardTeam.league !== player.league
      || (requiresCurrentTeam && player.currentTeamId !== card.teamId)) {
      context.addIssue({ code: 'custom', message: `${card.id} has an invalid player/team/role reference` });
    }
    if (card.cardType === 'starter') {
      const base = baseByPlayer.get(card.playerId);
      const baseAttributes = base?.attributes as unknown as Record<string, number> | undefined;
      const starterAttributes = card.attributes as unknown as Record<string, number>;
      const attributeDeltas = baseAttributes
        ? Object.keys(starterAttributes).map((key) => starterAttributes[key] - baseAttributes[key])
        : [];
      if (!base || base.role !== card.role
        || card.overall > base.overall
        || (card.overall === base.overall
          && (base.overall !== 68 || !STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(card.playerId)))) {
        context.addIssue({
          code: 'custom',
          message: `${card.id} requires a matching Base version with a higher overall except at the shared 68 floor`,
        });
      }
      if (attributeDeltas.length === 0
        || attributeDeltas.some((delta) => delta > 0)
        || !attributeDeltas.some((delta) => delta < 0)) {
        context.addIssue({
          code: 'custom',
          message: `${card.id} Starter attributes must never exceed Base and at least one must be strictly lower`,
        });
      }
    }
    if (card.cardType === 'event') {
      const base = baseByPlayer.get(card.playerId);
      if (!base || base.role !== card.role) {
        context.addIssue({ code: 'custom', message: `${card.id} requires a matching Base version` });
      } else {
        const eventAttributes = Object.entries(card.attributes) as Array<[string, number]>;
        const baseAttributes = base.attributes as unknown as Record<string, number>;
        const hasStrength = eventAttributes.some(([key, value]) => value > baseAttributes[key]);
        const hasTradeoff = eventAttributes.some(([key, value]) => value < baseAttributes[key]);
        if (!hasStrength || !hasTradeoff) {
          context.addIssue({ code: 'custom', message: `${card.id} must include at least one strength and one tradeoff versus Base` });
        }
      }
    }
  }
  for (const squad of catalog.starterSquads) {
    if (!teams.has(squad.teamId)) context.addIssue({ code: 'custom', message: `Unknown StarterSquad team ${squad.teamId}` });
    const squadCardIds = new Set(squad.cards);
    const lineupCardIds = new Set(Object.values(squad.lineup));
    if (squadCardIds.size !== 6 || lineupCardIds.size !== 6) {
      context.addIssue({ code: 'custom', message: `${squad.teamId} StarterSquad must contain six unique cards` });
    }
    if (squadCardIds.size !== lineupCardIds.size
      || [...squadCardIds].some((cardId) => !lineupCardIds.has(cardId))) {
      context.addIssue({
        code: 'custom',
        message: `${squad.teamId} StarterSquad cards and lineup must contain the same IDs`,
      });
    }
    for (const [slot, cardId] of Object.entries(squad.lineup)) {
      const card = cards.get(cardId);
      const player = card ? players.get(card.playerId) : undefined;
      if (!card || card.cardType !== 'starter' || card.teamId !== squad.teamId || !player?.eligiblePositions.includes(slot as never)) {
        context.addIssue({ code: 'custom', message: `${squad.teamId} has invalid starter slot ${slot}` });
      }
    }
    const starterRatings = squad.cards.map((cardId) => cards.get(cardId)?.overall ?? 0);
    const computedAverage = starterRatings.reduce((sum, overall) => sum + overall, 0) / starterRatings.length;
    if (computedAverage !== 72 || squad.averageOverall !== computedAverage) {
      context.addIssue({
        code: 'custom',
        message: `${squad.teamId} StarterSquad must have a computed and declared average of exactly 72`,
      });
    }
    const hasFloorException = squad.cards.some((cardId) => {
      const card = cards.get(cardId);
      return card !== undefined && STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(card.playerId);
    });
    if (hasFloorException && (!squad.validationMetadata.requiresManualReview
      || !squad.validationMetadata.manualReviewReasons.some((reason) => reason.includes('reviewed 68-OVR floor exception')))) {
      context.addIssue({
        code: 'custom',
        message: `${squad.teamId} must audit its reviewed 68-OVR floor exception`,
      });
    }
    const teamBase = catalog.cards
      .filter((card) => card.cardType === 'base' && card.teamId === squad.teamId)
      .sort((left, right) => right.overall - left.overall || left.playerId.localeCompare(right.playerId));
    const cutoff = teamBase[2]?.overall;
    const starterPlayerIds = new Set(squad.cards.map((cardId) => cards.get(cardId)?.playerId));
    if (teamBase.length < 18 || cutoff === undefined) {
      context.addIssue({ code: 'custom', message: `${squad.teamId} must have at least 18 active Base cards` });
    } else {
      const protectedIds = teamBase.filter((card) => card.overall >= cutoff).map((card) => card.playerId);
      if (protectedIds.some((playerId) => starterPlayerIds.has(playerId))
        || protectedIds.some((playerId) => !squad.validationMetadata.excludedTopBasePlayerIds.includes(playerId))) {
        context.addIssue({ code: 'custom', message: `${squad.teamId} StarterSquad violates its top-Base cutoff` });
      }
    }
    if (starterPlayerIds.has('nhl-connor-mcdavid')) {
      context.addIssue({ code: 'custom', message: 'Connor McDavid cannot be included in an Edmonton StarterSquad' });
    }
  }
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>;

export function parseCatalog(input: unknown): Catalog & ContentCatalog & {
  players: CardCatalog['players'];
  cards: CardCatalog['cards'];
} {
  return catalogSchema.parse(input) as Catalog & ContentCatalog & {
    players: CardCatalog['players']; cards: CardCatalog['cards'];
  };
}
