import type { CardCatalog } from '../cards/types';
import { validateLineup } from '../lineups/validation';
import type { GameMode, Lineup } from '../lineups/types';
import { randomIndex } from './rng';
import type { AiDifficulty } from './types';

export interface AiOpponentIdentity {
  readonly nickname: string;
  readonly playStyle: string;
}

export interface AiOpponentDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly strengthTier: 1 | 2 | 3;
  readonly identity: AiOpponentIdentity;
  readonly lineup: Lineup;
}

type SlotIds = Lineup['slots'];

function opponent(
  id: string,
  name: string,
  description: string,
  mode: GameMode,
  difficulty: AiDifficulty,
  strengthTier: 1 | 2 | 3,
  identity: AiOpponentIdentity,
  slots: SlotIds,
): AiOpponentDefinition {
  return {
    id,
    name,
    description,
    mode,
    difficulty,
    strengthTier,
    identity,
    lineup: { id: `ai-lineup:${id}`, name: `${name} Six`, mode, slots },
  };
}

/** Curated, reproducible rivals. Card strength and decision quality both rise by tier. */
export const AI_OPPONENTS: readonly AiOpponentDefinition[] = [
  opponent('nhl-rookie-north-stars', 'North Stars', 'A direct NHL rival learning when to hold its best card.', 'nhl-circuit', 'rookie', 1, { nickname: 'The Learners', playStyle: 'Straight-line pressure with generous card timing.' }, {
    LW: 'nhl-j-t-compher-base', C: 'nhl-dakota-joshua-base', RW: 'nhl-dalibor-dvorsky-base',
    LD: 'nhl-alexandre-carrier-base', RD: 'nhl-colton-parayko-base', G: 'nhl-elvis-merzlikins-base',
  }),
  opponent('nhl-pro-harbor-six', 'Harbor Six', 'A composed NHL group with a strong answer in every situation.', 'nhl-circuit', 'pro', 2, { nickname: 'The Navigators', playStyle: 'Balanced possession and deliberate situational choices.' }, {
    LW: 'nhl-jamie-benn-base', C: 'nhl-boone-jenner-base', RW: 'nhl-connor-brown-base',
    LD: 'nhl-brandon-montour-base', RD: 'nhl-dougie-hamilton-base', G: 'nhl-darcy-kuemper-base',
  }),
  opponent('nhl-elite-summit-club', 'Summit Club', 'Top-end NHL talent that protects premium cards for premium moments.', 'nhl-circuit', 'elite', 3, { nickname: 'The Peak', playStyle: 'Elite transition skill and disciplined opportunity management.' }, {
    LW: 'nhl-brady-tkachuk-frozen-frights', C: 'nhl-connor-bedard-rising-stars', RW: 'nhl-seth-jarvis-playoff-heroes',
    LD: 'nhl-adam-fox-franchise-icons', RD: 'nhl-cale-makar-signature-series', G: 'nhl-igor-shesterkin-frozen-frights',
  }),
  opponent('pwhl-rookie-lake-lights', 'Lake Lights', 'An energetic PWHL rival that attacks early and leaves openings late.', 'pwhl-circuit', 'rookie', 1, { nickname: 'The Sparks', playStyle: 'High energy with exploratory card choices.' }, {
    LW: 'pwhl-brooke-bryant-base', C: 'pwhl-clair-degeorge-base', RW: 'pwhl-taylor-house-base',
    LD: 'pwhl-madison-bizal-base', RD: 'pwhl-jessica-kondas-base', G: 'pwhl-marlene-boissonnault-base',
  }),
  opponent('pwhl-pro-metro-six', 'Metro Six', 'A mobile PWHL lineup built to control the middle rounds.', 'pwhl-circuit', 'pro', 2, { nickname: 'The Conductors', playStyle: 'Structured puck movement with selective aggression.' }, {
    LW: 'pwhl-natalie-mlynkova-base', C: 'pwhl-liz-schepers-base', RW: 'pwhl-sophie-shirley-base',
    LD: 'pwhl-erin-ambrose-base', RD: 'pwhl-jocelyne-larocque-base', G: 'pwhl-kristen-campbell-base',
  }),
  opponent('pwhl-elite-crown-line', 'Crown Line', 'Complete PWHL stars with very few weak situational matchups.', 'pwhl-circuit', 'elite', 3, { nickname: 'The Standard', playStyle: 'Patient elite execution backed by championship poise.' }, {
    LW: 'pwhl-alex-carpenter-franchise-icons', C: 'pwhl-kristyna-kaltounkova-rising-stars', RW: 'pwhl-sarah-fillier-franchise-icons',
    LD: 'pwhl-megan-keller-franchise-icons', RD: 'pwhl-sophie-jaques-winter-classic', G: 'pwhl-gwyneth-philips-record-breakers',
  }),
  opponent('open-rookie-cross-ice', 'Cross Ice Club', 'A mixed six experimenting with combinations from both leagues.', 'open-ice', 'rookie', 1, { nickname: 'The Mixers', playStyle: 'Unpredictable but forgiving cross-league combinations.' }, {
    LW: 'pwhl-brooke-bryant-base', C: 'nhl-dakota-joshua-base', RW: 'pwhl-lauren-messier-base',
    LD: 'nhl-alexandre-carrier-base', RD: 'pwhl-jessica-kondas-base', G: 'nhl-elvis-merzlikins-base',
  }),
  opponent('open-pro-confluence', 'Confluence', 'A deliberately balanced mixed lineup with answers across the deck.', 'open-ice', 'pro', 2, { nickname: 'The Current', playStyle: 'Cross-league possession and measured card conservation.' }, {
    LW: 'nhl-jamie-benn-base', C: 'pwhl-liz-schepers-base', RW: 'nhl-connor-brown-base',
    LD: 'pwhl-erin-ambrose-base', RD: 'nhl-dougie-hamilton-base', G: 'pwhl-kristen-campbell-base',
  }),
  opponent('open-elite-northern-alliance', 'Northern Alliance', 'A mixed fantasy lineup assembled from the strongest complementary profiles.', 'open-ice', 'elite', 3, { nickname: 'The Alliance', playStyle: 'Elite complementary roles and near-optimal card timing.' }, {
    LW: 'pwhl-alex-carpenter-franchise-icons', C: 'nhl-connor-bedard-rising-stars', RW: 'pwhl-sarah-fillier-franchise-icons',
    LD: 'nhl-adam-fox-franchise-icons', RD: 'pwhl-sophie-jaques-winter-classic', G: 'nhl-igor-shesterkin-frozen-frights',
  }),
];

export function getAiOpponents(
  mode: GameMode,
  difficulty?: AiDifficulty,
  opponents: readonly AiOpponentDefinition[] = AI_OPPONENTS,
): readonly AiOpponentDefinition[] {
  return opponents.filter((candidate) =>
    candidate.mode === mode && (difficulty === undefined || candidate.difficulty === difficulty));
}

/** Stable selection API; adding more rivals to a tier will not require App changes. */
export function selectAiOpponent(
  mode: GameMode,
  difficulty: AiDifficulty,
  seed: string | number,
  opponents: readonly AiOpponentDefinition[] = AI_OPPONENTS,
): AiOpponentDefinition {
  const pool = getAiOpponents(mode, difficulty, opponents);
  if (pool.length === 0) {
    throw new RangeError(`No AI opponent is configured for ${mode} ${difficulty}.`);
  }
  return pool[randomIndex(`ai-opponent:${mode}:${difficulty}:${seed}`, pool.length)];
}

export function calculateAiOpponentOverall(
  definition: AiOpponentDefinition,
  catalog: CardCatalog,
): number {
  const cards = new Map(catalog.cards.map((card) => [card.id, card]));
  const values = Object.values(definition.lineup.slots).map((cardId) => cards.get(cardId)?.overall);
  if (values.some((overall) => overall === undefined)) {
    throw new TypeError(`AI opponent ${definition.id} references a missing catalog card.`);
  }
  return values.reduce<number>((sum, overall) => sum + (overall ?? 0), 0) / values.length;
}

export function validateAiOpponentDefinitions(
  catalog: CardCatalog,
  opponents: readonly AiOpponentDefinition[] = AI_OPPONENTS,
): void {
  const ids = new Set<string>();
  const cardsById = new Map(catalog.cards.map((card) => [card.id, card]));
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));
  for (const definition of opponents) {
    if (ids.has(definition.id)) throw new TypeError(`Duplicate AI opponent id: ${definition.id}.`);
    ids.add(definition.id);
    if (definition.lineup.mode !== definition.mode || !validateLineup(definition.lineup, catalog).valid) {
      throw new TypeError(`AI opponent ${definition.id} has an invalid lineup.`);
    }
    const usedPlayerIds = new Set<string>();
    for (const cardId of Object.values(definition.lineup.slots)) {
      const card = cardsById.get(cardId);
      const player = card ? playersById.get(card.playerId) : undefined;
      if (!card || !player) throw new TypeError(`AI opponent ${definition.id} references missing content.`);
      const expectedCardType = definition.difficulty === 'elite' ? 'event' : 'base';
      if (card.cardType !== expectedCardType) {
        throw new TypeError(`AI opponent ${definition.id} must use ${expectedCardType} cards at ${definition.difficulty}.`);
      }
      if (!player.active || player.sourceMetadata.sourceRosterStatus !== 'active-roster') {
        throw new TypeError(`AI opponent ${definition.id} uses inactive or non-roster player ${player.id}.`);
      }
      if (usedPlayerIds.has(player.id)) {
        throw new TypeError(`AI opponent ${definition.id} uses player ${player.id} more than once.`);
      }
      usedPlayerIds.add(player.id);
    }
  }
  for (const mode of ['nhl-circuit', 'pwhl-circuit', 'open-ice'] as const) {
    const overalls = (['rookie', 'pro', 'elite'] as const).map((difficulty) => {
      const pool = getAiOpponents(mode, difficulty, opponents);
      if (pool.length === 0) throw new TypeError(`Missing ${mode} ${difficulty} AI opponent.`);
      return Math.min(...pool.map((definition) => calculateAiOpponentOverall(definition, catalog)));
    });
    if (!(overalls[0] < overalls[1] && overalls[1] < overalls[2])) {
      throw new RangeError(`${mode} AI lineup strength must rise from Rookie to Pro to Elite.`);
    }
  }
}
