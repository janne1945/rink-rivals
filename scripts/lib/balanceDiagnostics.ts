import type { CardCatalog, League } from '../../src/domain/cards/types';
import type { GameMode, Lineup, LineupSlot } from '../../src/domain/lineups/types';
import {
  calculateBaseScore,
  createBattle,
  getEligibleCards,
  revealRound,
  selectCard,
} from '../../src/domain/battle/engine';
import type { BattleSide, BattleState, RoundWinner } from '../../src/domain/battle/types';
import { randomIndex } from '../../src/domain/battle/rng';

export interface BalanceReport {
  readonly seedPrefix: string;
  readonly pairedSeeds: number;
  readonly matches: number;
  readonly wins: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly winRates: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly roundWins: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly situationResults: Readonly<
    Record<string, Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>>
  >;
  readonly averageBaseOverall: Readonly<Record<'NHL' | 'PWHL', number>>;
  readonly baseOverallRange: Readonly<Record<'NHL' | 'PWHL', readonly [number, number]>>;
  readonly leagueWinRateGap: number;
}

function openIce(lineup: Lineup, suffix: string): Lineup {
  return { ...lineup, id: `${lineup.id}-${suffix}`, mode: 'open-ice' };
}

function seededLeagueLineup(
  catalog: CardCatalog,
  league: League,
  template: Lineup,
  seed: string,
): Lineup {
  const players = new Map(catalog.players.map((player) => [player.id, player]));
  const slots = Object.fromEntries(
    (['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const).map((slot) => {
      const candidates = catalog.cards
        .filter((card) => {
          const player = players.get(card.playerId);
          return (
            card.cardType === 'base' &&
            player?.league === league &&
            player.eligiblePositions.includes(slot as never)
          );
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      if (candidates.length === 0) {
        throw new Error(`No ${league} base card can fill ${slot}`);
      }
      return [slot, candidates[randomIndex(`${seed}:${league}:${slot}`, candidates.length)].id];
    }),
  ) as Record<LineupSlot, string>;

  return openIce({ ...template, slots }, `${seed}-${league.toLowerCase()}`);
}

function chooseGreedyCard(state: BattleState, side: BattleSide): string {
  const situation = state.situations[state.roundIndex];
  const eligible = getEligibleCards(state, side);
  if (eligible.length === 0) {
    throw new Error(`No eligible ${side} card in round ${state.roundIndex + 1}`);
  }
  return [...eligible].sort((left, right) => {
    const scoreDelta =
      calculateBaseScore(right.card, situation) - calculateBaseScore(left.card, situation);
    return scoreDelta || left.card.id.localeCompare(right.card.id);
  })[0].card.id;
}

function playGreedyMatch(
  seed: string,
  catalog: CardCatalog,
  playerLineup: Lineup,
  opponentLineup: Lineup,
): BattleState {
  let state = createBattle({
    seed,
    mode: 'open-ice' satisfies GameMode,
    catalog,
    playerLineup,
    opponentLineup,
  });
  while (state.phase !== 'complete') {
    state = selectCard(state, 'player', chooseGreedyCard(state, 'player'));
    state = selectCard(state, 'opponent', chooseGreedyCard(state, 'opponent'));
    state = revealRound(state);
  }
  return state;
}

function leagueWinner(
  winner: RoundWinner,
  playerLeague: 'NHL' | 'PWHL',
): 'NHL' | 'PWHL' | 'tie' {
  if (winner === 'tie') return 'tie';
  return winner === 'player' ? playerLeague : playerLeague === 'NHL' ? 'PWHL' : 'NHL';
}

function roundLeagueWinner(
  winner: RoundWinner,
  playerLeague: 'NHL' | 'PWHL',
): 'NHL' | 'PWHL' | 'tie' {
  return leagueWinner(winner, playerLeague);
}

export function runBalanceDiagnostics(
  catalog: CardCatalog,
  lineups: readonly Lineup[],
  pairedSeeds = 2_000,
  seedPrefix = 'rink-rivals-balance-v1',
): BalanceReport {
  if (!Number.isSafeInteger(pairedSeeds) || pairedSeeds <= 0) {
    throw new Error('pairedSeeds must be a positive integer');
  }
  const nhlLineup = lineups.find((lineup) => lineup.mode === 'nhl-circuit');
  const pwhlLineup = lineups.find((lineup) => lineup.mode === 'pwhl-circuit');
  if (!nhlLineup || !pwhlLineup) {
    throw new Error('Balance diagnostics require NHL and PWHL starter lineups');
  }

  const wins = { NHL: 0, PWHL: 0, tie: 0 };
  const roundWins = { NHL: 0, PWHL: 0, tie: 0 };
  const situationResults: Record<string, Record<'NHL' | 'PWHL' | 'tie', number>> = {};

  for (let index = 0; index < pairedSeeds; index += 1) {
    const pairSeed = `${seedPrefix}:${index}`;
    const openNhl = seededLeagueLineup(catalog, 'NHL', nhlLineup, pairSeed);
    const openPwhl = seededLeagueLineup(catalog, 'PWHL', pwhlLineup, pairSeed);
    const first = playGreedyMatch(
      `${pairSeed}:match`,
      catalog,
      openNhl,
      openPwhl,
    );
    const second = playGreedyMatch(
      `${pairSeed}:match`,
      catalog,
      openPwhl,
      openNhl,
    );
    for (const [match, playerLeague] of [
      [first, 'NHL'],
      [second, 'PWHL'],
    ] as const) {
      wins[leagueWinner(match.winner ?? 'tie', playerLeague)] += 1;
      for (const result of match.results) {
        const winningLeague = roundLeagueWinner(result.winner, playerLeague);
        roundWins[winningLeague] += 1;
        const situation = (situationResults[result.situation.id] ??= {
          NHL: 0,
          PWHL: 0,
          tie: 0,
        });
        situation[winningLeague] += 1;
      }
    }
  }

  const baseCards = catalog.cards.filter((card) => card.cardType === 'base');
  const playerById = new Map(catalog.players.map((player) => [player.id, player]));
  const averageBaseOverall = {} as Record<'NHL' | 'PWHL', number>;
  const baseOverallRange = {} as Record<'NHL' | 'PWHL', readonly [number, number]>;
  for (const league of ['NHL', 'PWHL'] as const) {
    const values = baseCards
      .filter((card) => playerById.get(card.playerId)?.league === league)
      .map((card) => card.overall);
    averageBaseOverall[league] = values.reduce((sum, value) => sum + value, 0) / values.length;
    baseOverallRange[league] = [Math.min(...values), Math.max(...values)];
  }

  const matches = pairedSeeds * 2;
  const winRates = {
    NHL: wins.NHL / matches,
    PWHL: wins.PWHL / matches,
    tie: wins.tie / matches,
  };

  return {
    seedPrefix,
    pairedSeeds,
    matches,
    wins,
    winRates,
    roundWins,
    situationResults,
    averageBaseOverall,
    baseOverallRange,
    leagueWinRateGap: Math.abs(winRates.NHL - winRates.PWHL),
  };
}
