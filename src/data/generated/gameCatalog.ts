import type {
  CardCatalog,
  CardVersion,
  GoalieAttributes,
  GoaliePlayer,
  Player,
  SkaterAttributes,
  SkaterPlayer,
} from '../../domain/cards/types';
import type { Lineup } from '../../domain/lineups/types';
import { parseCatalog } from '../catalogSchema';

const placeholderFor = (playerId: string) => `placeholder:player/${playerId}`;

function skater(
  player: Omit<SkaterPlayer, 'role' | 'imageReference'>,
): SkaterPlayer {
  return {
    ...player,
    role: 'skater',
    imageReference: placeholderFor(player.id),
  };
}

function goalie(
  player: Omit<GoaliePlayer, 'role' | 'imageReference' | 'primaryPosition' | 'eligiblePositions'>,
): GoaliePlayer {
  return {
    ...player,
    role: 'goalie',
    primaryPosition: 'G',
    eligiblePositions: ['G'],
    imageReference: placeholderFor(player.id),
  };
}

function baseSkaterCard(
  playerId: string,
  overall: number,
  attributes: SkaterAttributes,
  abilities: readonly string[],
): CardVersion {
  return {
    id: `${playerId}-base`,
    playerId,
    setId: 'base-2026',
    cardType: 'base',
    role: 'skater',
    overall,
    attributes,
    abilities,
    price: 450 + (overall - 88) * 125,
    isPermanent: true,
  };
}

function baseGoalieCard(
  playerId: string,
  overall: number,
  attributes: GoalieAttributes,
  abilities: readonly string[],
): CardVersion {
  return {
    id: `${playerId}-base`,
    playerId,
    setId: 'base-2026',
    cardType: 'base',
    role: 'goalie',
    overall,
    attributes,
    abilities,
    price: 450 + (overall - 88) * 125,
    isPermanent: true,
  };
}

const players: readonly Player[] = [
  skater({ id: 'nhl-kirill-kaprizov', name: 'Kirill Kaprizov', league: 'NHL', team: 'Minnesota', nationality: 'RUS', archetype: 'dynamic scorer', handedness: 'left', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'nhl-artemi-panarin', name: 'Artemi Panarin', league: 'NHL', team: 'New York', nationality: 'RUS', archetype: 'playmaking winger', handedness: 'right', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'nhl-brady-tkachuk', name: 'Brady Tkachuk', league: 'NHL', team: 'Ottawa', nationality: 'USA', archetype: 'power forward', handedness: 'left', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'nhl-connor-mcdavid', name: 'Connor McDavid', league: 'NHL', team: 'Edmonton', nationality: 'CAN', archetype: 'speed playmaker', handedness: 'left', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'nhl-nathan-mackinnon', name: 'Nathan MacKinnon', league: 'NHL', team: 'Colorado', nationality: 'CAN', archetype: 'power playmaker', handedness: 'right', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'nhl-auston-matthews', name: 'Auston Matthews', league: 'NHL', team: 'Toronto', nationality: 'USA', archetype: 'two-way sniper', handedness: 'left', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'nhl-nikita-kucherov', name: 'Nikita Kucherov', league: 'NHL', team: 'Tampa Bay', nationality: 'RUS', archetype: 'elite playmaker', handedness: 'left', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'nhl-david-pastrnak', name: 'David Pastrnak', league: 'NHL', team: 'Boston', nationality: 'CZE', archetype: 'creative sniper', handedness: 'right', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'nhl-mikko-rantanen', name: 'Mikko Rantanen', league: 'NHL', team: 'Dallas', nationality: 'FIN', archetype: 'power scorer', handedness: 'left', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'nhl-quinn-hughes', name: 'Quinn Hughes', league: 'NHL', team: 'Vancouver', nationality: 'USA', archetype: 'puck-moving defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'nhl-rasmus-dahlin', name: 'Rasmus Dahlin', league: 'NHL', team: 'Buffalo', nationality: 'SWE', archetype: 'two-way defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'nhl-josh-morrissey', name: 'Josh Morrissey', league: 'NHL', team: 'Winnipeg', nationality: 'CAN', archetype: 'mobile defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'nhl-cale-makar', name: 'Cale Makar', league: 'NHL', team: 'Colorado', nationality: 'CAN', archetype: 'offensive defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  skater({ id: 'nhl-adam-fox', name: 'Adam Fox', league: 'NHL', team: 'New York', nationality: 'USA', archetype: 'possession defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  skater({ id: 'nhl-evan-bouchard', name: 'Evan Bouchard', league: 'NHL', team: 'Edmonton', nationality: 'CAN', archetype: 'shooting defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  goalie({ id: 'nhl-connor-hellebuyck', name: 'Connor Hellebuyck', league: 'NHL', team: 'Winnipeg', nationality: 'USA', archetype: 'positioning goalie', handedness: 'left' }),
  goalie({ id: 'nhl-igor-shesterkin', name: 'Igor Shesterkin', league: 'NHL', team: 'New York', nationality: 'RUS', archetype: 'reflex goalie', handedness: 'left' }),
  goalie({ id: 'nhl-andrei-vasilevskiy', name: 'Andrei Vasilevskiy', league: 'NHL', team: 'Tampa Bay', nationality: 'RUS', archetype: 'hybrid goalie', handedness: 'left' }),

  skater({ id: 'pwhl-sarah-nurse', name: 'Sarah Nurse', league: 'PWHL', team: 'Vancouver', nationality: 'CAN', archetype: 'two-way winger', handedness: 'left', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'pwhl-kendall-coyne-schofield', name: 'Kendall Coyne Schofield', league: 'PWHL', team: 'Minnesota', nationality: 'USA', archetype: 'speed winger', handedness: 'left', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'pwhl-emma-maltais', name: 'Emma Maltais', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'forechecking winger', handedness: 'left', primaryPosition: 'LW', eligiblePositions: ['LW'] }),
  skater({ id: 'pwhl-marie-philip-poulin', name: 'Marie-Philip Poulin', league: 'PWHL', team: 'Montréal', nationality: 'CAN', archetype: 'clutch two-way center', handedness: 'left', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'pwhl-taylor-heise', name: 'Taylor Heise', league: 'PWHL', team: 'Minnesota', nationality: 'USA', archetype: 'dynamic center', handedness: 'right', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'pwhl-alex-carpenter', name: 'Alex Carpenter', league: 'PWHL', team: 'New York', nationality: 'USA', archetype: 'playmaking center', handedness: 'left', primaryPosition: 'C', eligiblePositions: ['C'] }),
  skater({ id: 'pwhl-hilary-knight', name: 'Hilary Knight', league: 'PWHL', team: 'Seattle', nationality: 'USA', archetype: 'power scorer', handedness: 'right', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'pwhl-natalie-spooner', name: 'Natalie Spooner', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'net-front scorer', handedness: 'right', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'pwhl-daryl-watts', name: 'Daryl Watts', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'creative winger', handedness: 'right', primaryPosition: 'RW', eligiblePositions: ['RW'] }),
  skater({ id: 'pwhl-megan-keller', name: 'Megan Keller', league: 'PWHL', team: 'Boston', nationality: 'USA', archetype: 'two-way defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'pwhl-ella-shelton', name: 'Ella Shelton', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'puck-moving defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'pwhl-claire-thompson', name: 'Claire Thompson', league: 'PWHL', team: 'Vancouver', nationality: 'CAN', archetype: 'transition defender', handedness: 'left', primaryPosition: 'LD', eligiblePositions: ['LD'] }),
  skater({ id: 'pwhl-erin-ambrose', name: 'Erin Ambrose', league: 'PWHL', team: 'Montréal', nationality: 'CAN', archetype: 'offensive defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  skater({ id: 'pwhl-renata-fast', name: 'Renata Fast', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'shutdown defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  skater({ id: 'pwhl-sophie-jaques', name: 'Sophie Jaques', league: 'PWHL', team: 'Vancouver', nationality: 'CAN', archetype: 'shooting defender', handedness: 'right', primaryPosition: 'RD', eligiblePositions: ['RD'] }),
  goalie({ id: 'pwhl-aerin-frankel', name: 'Aerin Frankel', league: 'PWHL', team: 'Boston', nationality: 'USA', archetype: 'reflex goalie', handedness: 'left' }),
  goalie({ id: 'pwhl-ann-renee-desbiens', name: 'Ann-Renée Desbiens', league: 'PWHL', team: 'Montréal', nationality: 'CAN', archetype: 'positioning goalie', handedness: 'left' }),
  goalie({ id: 'pwhl-kristen-campbell', name: 'Kristen Campbell', league: 'PWHL', team: 'Toronto', nationality: 'CAN', archetype: 'hybrid goalie', handedness: 'left' }),
];

const cards: readonly CardVersion[] = [
  baseSkaterCard('nhl-kirill-kaprizov', 93, { speed: 95, shooting: 94, passing: 91, puckControl: 95, defense: 84, physicality: 84, hockeyIq: 94, clutch: 92 }, ['quick release']),
  baseSkaterCard('nhl-artemi-panarin', 92, { speed: 91, shooting: 92, passing: 96, puckControl: 95, defense: 81, physicality: 72, hockeyIq: 95, clutch: 91 }, ['thread the needle']),
  baseSkaterCard('nhl-brady-tkachuk', 91, { speed: 86, shooting: 91, passing: 85, puckControl: 88, defense: 86, physicality: 97, hockeyIq: 89, clutch: 93 }, ['net-front force']),
  baseSkaterCard('nhl-connor-mcdavid', 96, { speed: 99, shooting: 95, passing: 98, puckControl: 99, defense: 86, physicality: 82, hockeyIq: 98, clutch: 97 }, ['blazing entry', 'elite vision']),
  baseSkaterCard('nhl-nathan-mackinnon', 95, { speed: 97, shooting: 96, passing: 94, puckControl: 96, defense: 86, physicality: 94, hockeyIq: 96, clutch: 96 }, ['power rush']),
  baseSkaterCard('nhl-auston-matthews', 94, { speed: 91, shooting: 99, passing: 90, puckControl: 94, defense: 92, physicality: 88, hockeyIq: 96, clutch: 95 }, ['precision finish']),
  baseSkaterCard('nhl-nikita-kucherov', 95, { speed: 93, shooting: 96, passing: 99, puckControl: 98, defense: 82, physicality: 76, hockeyIq: 99, clutch: 96 }, ['deceptive passing']),
  baseSkaterCard('nhl-david-pastrnak', 94, { speed: 92, shooting: 98, passing: 92, puckControl: 96, defense: 80, physicality: 80, hockeyIq: 95, clutch: 95 }, ['one-timer']),
  baseSkaterCard('nhl-mikko-rantanen', 93, { speed: 89, shooting: 95, passing: 93, puckControl: 94, defense: 85, physicality: 92, hockeyIq: 94, clutch: 94 }, ['cycle strength']),
  baseSkaterCard('nhl-quinn-hughes', 94, { speed: 96, shooting: 88, passing: 98, puckControl: 98, defense: 92, physicality: 79, hockeyIq: 98, clutch: 93 }, ['blue-line escape']),
  baseSkaterCard('nhl-rasmus-dahlin', 90, { speed: 89, shooting: 88, passing: 91, puckControl: 91, defense: 93, physicality: 91, hockeyIq: 92, clutch: 89 }, ['gap control']),
  baseSkaterCard('nhl-josh-morrissey', 91, { speed: 91, shooting: 86, passing: 93, puckControl: 91, defense: 93, physicality: 87, hockeyIq: 94, clutch: 91 }, ['smart breakout']),
  baseSkaterCard('nhl-cale-makar', 95, { speed: 97, shooting: 92, passing: 97, puckControl: 98, defense: 94, physicality: 86, hockeyIq: 98, clutch: 96 }, ['end-to-end']),
  baseSkaterCard('nhl-adam-fox', 93, { speed: 90, shooting: 85, passing: 97, puckControl: 95, defense: 95, physicality: 82, hockeyIq: 98, clutch: 92 }, ['possession anchor']),
  baseSkaterCard('nhl-evan-bouchard', 92, { speed: 87, shooting: 96, passing: 94, puckControl: 90, defense: 89, physicality: 91, hockeyIq: 92, clutch: 94 }, ['point blast']),
  baseGoalieCard('nhl-connor-hellebuyck', 96, { reflexes: 96, positioning: 99, glove: 96, blocker: 96, reboundControl: 97, puckHandling: 88, consistency: 99, clutch: 97 }, ['calm crease']),
  baseGoalieCard('nhl-igor-shesterkin', 94, { reflexes: 98, positioning: 94, glove: 97, blocker: 95, reboundControl: 93, puckHandling: 94, consistency: 93, clutch: 95 }, ['reaction save']),
  baseGoalieCard('nhl-andrei-vasilevskiy', 93, { reflexes: 95, positioning: 94, glove: 94, blocker: 95, reboundControl: 93, puckHandling: 89, consistency: 92, clutch: 97 }, ['big-game focus']),

  baseSkaterCard('pwhl-sarah-nurse', 91, { speed: 93, shooting: 91, passing: 92, puckControl: 93, defense: 85, physicality: 84, hockeyIq: 92, clutch: 92 }, ['controlled entry']),
  baseSkaterCard('pwhl-kendall-coyne-schofield', 93, { speed: 99, shooting: 92, passing: 93, puckControl: 96, defense: 85, physicality: 76, hockeyIq: 94, clutch: 94 }, ['edge speed']),
  baseSkaterCard('pwhl-emma-maltais', 90, { speed: 92, shooting: 86, passing: 90, puckControl: 91, defense: 88, physicality: 86, hockeyIq: 92, clutch: 89 }, ['relentless pressure']),
  baseSkaterCard('pwhl-marie-philip-poulin', 96, { speed: 93, shooting: 97, passing: 97, puckControl: 98, defense: 92, physicality: 89, hockeyIq: 99, clutch: 99 }, ['captain clutch', 'complete game']),
  baseSkaterCard('pwhl-taylor-heise', 94, { speed: 96, shooting: 95, passing: 96, puckControl: 98, defense: 84, physicality: 84, hockeyIq: 95, clutch: 94 }, ['open-ice creator']),
  baseSkaterCard('pwhl-alex-carpenter', 93, { speed: 91, shooting: 95, passing: 96, puckControl: 95, defense: 86, physicality: 79, hockeyIq: 97, clutch: 95 }, ['half-wall vision']),
  baseSkaterCard('pwhl-hilary-knight', 94, { speed: 90, shooting: 98, passing: 91, puckControl: 94, defense: 83, physicality: 95, hockeyIq: 95, clutch: 97 }, ['power finish']),
  baseSkaterCard('pwhl-natalie-spooner', 95, { speed: 92, shooting: 99, passing: 90, puckControl: 95, defense: 82, physicality: 93, hockeyIq: 96, clutch: 96 }, ['crease presence']),
  baseSkaterCard('pwhl-daryl-watts', 92, { speed: 92, shooting: 94, passing: 96, puckControl: 97, defense: 78, physicality: 75, hockeyIq: 95, clutch: 93 }, ['creative hands']),
  baseSkaterCard('pwhl-megan-keller', 92, { speed: 90, shooting: 88, passing: 94, puckControl: 91, defense: 94, physicality: 92, hockeyIq: 95, clutch: 92 }, ['board denial']),
  baseSkaterCard('pwhl-ella-shelton', 91, { speed: 91, shooting: 90, passing: 94, puckControl: 93, defense: 89, physicality: 82, hockeyIq: 94, clutch: 91 }, ['clean exit']),
  baseSkaterCard('pwhl-claire-thompson', 93, { speed: 94, shooting: 91, passing: 97, puckControl: 95, defense: 92, physicality: 82, hockeyIq: 97, clutch: 93 }, ['transition spark']),
  baseSkaterCard('pwhl-erin-ambrose', 94, { speed: 91, shooting: 92, passing: 98, puckControl: 96, defense: 93, physicality: 83, hockeyIq: 98, clutch: 95 }, ['power-play conductor']),
  baseSkaterCard('pwhl-renata-fast', 92, { speed: 92, shooting: 82, passing: 90, puckControl: 89, defense: 96, physicality: 92, hockeyIq: 96, clutch: 92 }, ['shutdown gap']),
  baseSkaterCard('pwhl-sophie-jaques', 91, { speed: 89, shooting: 95, passing: 91, puckControl: 90, defense: 88, physicality: 86, hockeyIq: 92, clutch: 91 }, ['blue-line shot']),
  baseGoalieCard('pwhl-aerin-frankel', 94, { reflexes: 98, positioning: 94, glove: 97, blocker: 95, reboundControl: 93, puckHandling: 89, consistency: 95, clutch: 96 }, ['agile recovery']),
  baseGoalieCard('pwhl-ann-renee-desbiens', 95, { reflexes: 96, positioning: 98, glove: 96, blocker: 96, reboundControl: 97, puckHandling: 88, consistency: 97, clutch: 99 }, ['championship calm']),
  baseGoalieCard('pwhl-kristen-campbell', 93, { reflexes: 94, positioning: 96, glove: 93, blocker: 94, reboundControl: 95, puckHandling: 90, consistency: 96, clutch: 93 }, ['steady sequence']),
];

const EVENT_WINDOW = {
  availableFrom: '2026-07-01T00:00:00.000Z',
  availableTo: '2027-07-01T00:00:00.000Z',
} as const;

const eventCards: readonly CardVersion[] = [
  { ...baseSkaterCard('nhl-connor-mcdavid', 97, { speed: 99, shooting: 96, passing: 98, puckControl: 99, defense: 85, physicality: 84, hockeyIq: 99, clutch: 99 }, ['rivalry rush', 'late-game gear']), id: 'nhl-connor-mcdavid-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2500, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('nhl-quinn-hughes', 95, { speed: 97, shooting: 89, passing: 99, puckControl: 99, defense: 92, physicality: 77, hockeyIq: 99, clutch: 95 }, ['rivalry breakout']), id: 'nhl-quinn-hughes-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2250, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('nhl-david-pastrnak', 95, { speed: 93, shooting: 99, passing: 93, puckControl: 97, defense: 79, physicality: 81, hockeyIq: 96, clutch: 97 }, ['rivalry one-timer']), id: 'nhl-david-pastrnak-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2250, isPermanent: false, ...EVENT_WINDOW },
  { ...baseGoalieCard('nhl-connor-hellebuyck', 97, { reflexes: 97, positioning: 99, glove: 97, blocker: 97, reboundControl: 98, puckHandling: 89, consistency: 99, clutch: 99 }, ['rivalry lock']), id: 'nhl-connor-hellebuyck-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2500, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('nhl-kirill-kaprizov', 94, { speed: 97, shooting: 95, passing: 92, puckControl: 97, defense: 81, physicality: 83, hockeyIq: 95, clutch: 95 }, ['rivalry cut']), id: 'nhl-kirill-kaprizov-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2125, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('pwhl-marie-philip-poulin', 97, { speed: 94, shooting: 98, passing: 97, puckControl: 98, defense: 95, physicality: 92, hockeyIq: 99, clutch: 99 }, ['rivalry captain', 'golden moment']), id: 'pwhl-marie-philip-poulin-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2500, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('pwhl-hilary-knight', 95, { speed: 91, shooting: 98, passing: 91, puckControl: 94, defense: 88, physicality: 98, hockeyIq: 96, clutch: 99 }, ['rivalry power']), id: 'pwhl-hilary-knight-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2250, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('pwhl-megan-keller', 94, { speed: 91, shooting: 89, passing: 94, puckControl: 92, defense: 97, physicality: 96, hockeyIq: 96, clutch: 94 }, ['rivalry wall']), id: 'pwhl-megan-keller-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2125, isPermanent: false, ...EVENT_WINDOW },
  { ...baseGoalieCard('pwhl-ann-renee-desbiens', 97, { reflexes: 97, positioning: 99, glove: 97, blocker: 97, reboundControl: 98, puckHandling: 89, consistency: 99, clutch: 99 }, ['rivalry poise']), id: 'pwhl-ann-renee-desbiens-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2500, isPermanent: false, ...EVENT_WINDOW },
  { ...baseSkaterCard('pwhl-kendall-coyne-schofield', 94, { speed: 99, shooting: 92, passing: 93, puckControl: 97, defense: 89, physicality: 80, hockeyIq: 95, clutch: 96 }, ['rivalry acceleration']), id: 'pwhl-kendall-coyne-schofield-rivalry-2026', setId: 'rivalry-series-2026', cardType: 'featured', price: 2125, isPermanent: false, ...EVENT_WINDOW },
];

const generated = parseCatalog({
  metadata: {
    catalogId: 'rink-rivals-2026-preview',
    generatedAt: '2026-07-13T00:00:00.000Z',
    sourceWindow: ['2023-24', '2024-25', '2025-26'],
    disclaimer: 'Unofficial fan prototype. Names and fantasy ratings require manual review before release; no official images or logos are included.',
    requiresManualApproval: true,
  },
  players,
  cards: [...cards, ...eventCards],
});

export const catalogMetadata = generated.metadata;

export const gameCatalog: CardCatalog = {
  players: generated.players,
  cards: generated.cards,
};

export const starterLineups: readonly Lineup[] = [
  {
    id: 'starter-nhl-circuit',
    name: 'NHL Circuit Starter',
    mode: 'nhl-circuit',
    slots: {
      LW: 'nhl-artemi-panarin-base',
      C: 'nhl-auston-matthews-base',
      RW: 'nhl-mikko-rantanen-base',
      LD: 'nhl-rasmus-dahlin-base',
      RD: 'nhl-evan-bouchard-base',
      G: 'nhl-igor-shesterkin-base',
    },
  },
  {
    id: 'starter-pwhl-circuit',
    name: 'PWHL Circuit Starter',
    mode: 'pwhl-circuit',
    slots: {
      LW: 'pwhl-sarah-nurse-base',
      C: 'pwhl-alex-carpenter-base',
      RW: 'pwhl-daryl-watts-base',
      LD: 'pwhl-ella-shelton-base',
      RD: 'pwhl-renata-fast-base',
      G: 'pwhl-aerin-frankel-base',
    },
  },
  {
    id: 'starter-open-ice',
    name: 'Open Ice Starter',
    mode: 'open-ice',
    slots: {
      LW: 'nhl-kirill-kaprizov-base',
      C: 'pwhl-taylor-heise-base',
      RW: 'nhl-nikita-kucherov-base',
      LD: 'pwhl-claire-thompson-base',
      RD: 'nhl-adam-fox-base',
      G: 'pwhl-ann-renee-desbiens-base',
    },
  },
];
