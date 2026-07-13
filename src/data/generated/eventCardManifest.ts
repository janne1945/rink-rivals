import type {
  CardCatalog,
  CardType,
  CardVersion,
  GoalieAttributes,
  HockeyPosition,
  League,
  Player,
  SkaterAttributes,
} from '../../domain/cards/types';
import type { EventId } from '../../domain/shop/eventCalendar';

export const EVENT_CARD_AVAILABLE_FROM = '2026-01-01T00:00:00.000Z';
// Calendar membership, rather than a one-off expiry, controls these recurring cards.
export const EVENT_CARD_AVAILABLE_TO = '9999-12-31T23:59:59.999Z';

interface EventCardBlueprint {
  readonly id: string;
  readonly eventId: EventId;
  readonly playerId: string;
  readonly league: League;
  readonly position: HockeyPosition;
  readonly role: 'skater' | 'goalie';
  readonly cardType: CardType;
  readonly overallDelta: -1 | 0 | 1;
  readonly price: number;
  readonly ability: string;
}

interface BlueprintSeed {
  readonly playerId: string;
  readonly league: League;
  readonly position: HockeyPosition;
  readonly role: 'skater' | 'goalie';
  readonly overallDelta: -1 | 0 | 1;
  readonly price: number;
  readonly ability: string;
}

function eventSet(
  eventId: EventId,
  cardType: CardType,
  entries: readonly BlueprintSeed[],
): EventCardBlueprint[] {
  return entries.map((entry) => ({
    ...entry,
    id: `${entry.playerId}-${eventId}`,
    eventId,
    cardType,
  }));
}

/** Static source manifest: exactly six cards per event, split 3 NHL / 3 PWHL. */
export const EVENT_CARD_BLUEPRINTS: readonly EventCardBlueprint[] = [
  ...eventSet('frozen-frights', 'featured', [
    { playerId: 'nhl-brady-tkachuk', league: 'NHL', position: 'LW', role: 'skater', overallDelta: -1, price: 1900, ability: 'fright-night forecheck' },
    { playerId: 'nhl-rasmus-dahlin', league: 'NHL', position: 'LD', role: 'skater', overallDelta: 0, price: 1950, ability: 'frozen gap' },
    { playerId: 'nhl-igor-shesterkin', league: 'NHL', position: 'G', role: 'goalie', overallDelta: -1, price: 2100, ability: 'haunted crease' },
    { playerId: 'pwhl-emma-maltais', league: 'PWHL', position: 'LW', role: 'skater', overallDelta: 0, price: 1850, ability: 'relentless chill' },
    { playerId: 'pwhl-renata-fast', league: 'PWHL', position: 'RD', role: 'skater', overallDelta: -1, price: 1950, ability: 'cold shutdown' },
    { playerId: 'pwhl-kristen-campbell', league: 'PWHL', position: 'G', role: 'goalie', overallDelta: 0, price: 2050, ability: 'midnight calm' },
  ]),
  ...eventSet('signature-series', 'signature', [
    { playerId: 'nhl-connor-mcdavid', league: 'NHL', position: 'C', role: 'skater', overallDelta: 0, price: 2350, ability: 'signature acceleration' },
    { playerId: 'nhl-david-pastrnak', league: 'NHL', position: 'RW', role: 'skater', overallDelta: 1, price: 2250, ability: 'signature one-timer' },
    { playerId: 'nhl-cale-makar', league: 'NHL', position: 'RD', role: 'skater', overallDelta: 0, price: 2300, ability: 'signature escape' },
    { playerId: 'pwhl-marie-philip-poulin', league: 'PWHL', position: 'C', role: 'skater', overallDelta: 1, price: 2350, ability: 'signature captaincy' },
    { playerId: 'pwhl-hilary-knight', league: 'PWHL', position: 'RW', role: 'skater', overallDelta: 0, price: 2250, ability: 'signature power' },
    { playerId: 'pwhl-erin-ambrose', league: 'PWHL', position: 'RD', role: 'skater', overallDelta: 1, price: 2300, ability: 'signature conductor' },
  ]),
  ...eventSet('winter-holidays', 'featured', [
    { playerId: 'nhl-artemi-panarin', league: 'NHL', position: 'LW', role: 'skater', overallDelta: 0, price: 2050, ability: 'holiday helper' },
    { playerId: 'nhl-josh-morrissey', league: 'NHL', position: 'LD', role: 'skater', overallDelta: -1, price: 1950, ability: 'gifted breakout' },
    { playerId: 'nhl-andrei-vasilevskiy', league: 'NHL', position: 'G', role: 'goalie', overallDelta: 1, price: 2150, ability: 'silent night save' },
    { playerId: 'pwhl-sarah-nurse', league: 'PWHL', position: 'LW', role: 'skater', overallDelta: 0, price: 1950, ability: 'festive entry' },
    { playerId: 'pwhl-ella-shelton', league: 'PWHL', position: 'LD', role: 'skater', overallDelta: -1, price: 1900, ability: 'wrapped exit' },
    { playerId: 'pwhl-aerin-frankel', league: 'PWHL', position: 'G', role: 'goalie', overallDelta: 1, price: 2150, ability: 'holiday recovery' },
  ]),
  ...eventSet('winter-classic', 'featured', [
    { playerId: 'nhl-nathan-mackinnon', league: 'NHL', position: 'C', role: 'skater', overallDelta: 1, price: 2250, ability: 'outdoor rush' },
    { playerId: 'nhl-mikko-rantanen', league: 'NHL', position: 'RW', role: 'skater', overallDelta: 0, price: 2100, ability: 'snowbank cycle' },
    { playerId: 'nhl-evan-bouchard', league: 'NHL', position: 'RD', role: 'skater', overallDelta: -1, price: 2050, ability: 'frozen point blast' },
    { playerId: 'pwhl-taylor-heise', league: 'PWHL', position: 'C', role: 'skater', overallDelta: 1, price: 2200, ability: 'outdoor creator' },
    { playerId: 'pwhl-natalie-spooner', league: 'PWHL', position: 'RW', role: 'skater', overallDelta: 0, price: 2200, ability: 'classic crease drive' },
    { playerId: 'pwhl-sophie-jaques', league: 'PWHL', position: 'RD', role: 'skater', overallDelta: -1, price: 2000, ability: 'winter blue-line shot' },
  ]),
  ...eventSet('international-ice', 'featured', [
    { playerId: 'nhl-kirill-kaprizov', league: 'NHL', position: 'LW', role: 'skater', overallDelta: 0, price: 2150, ability: 'international edge' },
    { playerId: 'nhl-nikita-kucherov', league: 'NHL', position: 'RW', role: 'skater', overallDelta: 1, price: 2250, ability: 'global vision' },
    { playerId: 'nhl-quinn-hughes', league: 'NHL', position: 'LD', role: 'skater', overallDelta: 0, price: 2200, ability: 'wide-ice escape' },
    { playerId: 'pwhl-kendall-coyne-schofield', league: 'PWHL', position: 'LW', role: 'skater', overallDelta: -1, price: 2100, ability: 'international speed' },
    { playerId: 'pwhl-alex-carpenter', league: 'PWHL', position: 'C', role: 'skater', overallDelta: 0, price: 2050, ability: 'global half-wall' },
    { playerId: 'pwhl-claire-thompson', league: 'PWHL', position: 'LD', role: 'skater', overallDelta: 1, price: 2200, ability: 'international transition' },
  ]),
  ...eventSet('rising-stars', 'featured', [
    { playerId: 'nhl-auston-matthews', league: 'NHL', position: 'C', role: 'skater', overallDelta: -1, price: 2100, ability: 'rising release' },
    { playerId: 'nhl-josh-morrissey', league: 'NHL', position: 'LD', role: 'skater', overallDelta: 0, price: 1900, ability: 'rising read' },
    { playerId: 'nhl-evan-bouchard', league: 'NHL', position: 'RD', role: 'skater', overallDelta: 1, price: 2050, ability: 'rising point shot' },
    { playerId: 'pwhl-taylor-heise', league: 'PWHL', position: 'C', role: 'skater', overallDelta: -1, price: 2050, ability: 'rising creator' },
    { playerId: 'pwhl-daryl-watts', league: 'PWHL', position: 'RW', role: 'skater', overallDelta: 0, price: 1900, ability: 'rising hands' },
    { playerId: 'pwhl-ella-shelton', league: 'PWHL', position: 'LD', role: 'skater', overallDelta: 1, price: 1850, ability: 'rising exit' },
  ]),
  ...eventSet('playoff-heroes', 'elite', [
    { playerId: 'nhl-connor-mcdavid', league: 'NHL', position: 'C', role: 'skater', overallDelta: 1, price: 2400, ability: 'playoff takeover' },
    { playerId: 'nhl-mikko-rantanen', league: 'NHL', position: 'RW', role: 'skater', overallDelta: 0, price: 2200, ability: 'playoff cycle' },
    { playerId: 'nhl-connor-hellebuyck', league: 'NHL', position: 'G', role: 'goalie', overallDelta: 1, price: 2400, ability: 'playoff lock' },
    { playerId: 'pwhl-marie-philip-poulin', league: 'PWHL', position: 'C', role: 'skater', overallDelta: -1, price: 2300, ability: 'heroic finish' },
    { playerId: 'pwhl-hilary-knight', league: 'PWHL', position: 'RW', role: 'skater', overallDelta: 0, price: 2200, ability: 'playoff power' },
    { playerId: 'pwhl-ann-renee-desbiens', league: 'PWHL', position: 'G', role: 'goalie', overallDelta: -1, price: 2300, ability: 'heroic poise' },
  ]),
  ...eventSet('franchise-icons', 'elite', [
    { playerId: 'nhl-artemi-panarin', league: 'NHL', position: 'LW', role: 'skater', overallDelta: 0, price: 2250, ability: 'franchise vision' },
    { playerId: 'nhl-auston-matthews', league: 'NHL', position: 'C', role: 'skater', overallDelta: 0, price: 2350, ability: 'franchise finish' },
    { playerId: 'nhl-adam-fox', league: 'NHL', position: 'RD', role: 'skater', overallDelta: 0, price: 2250, ability: 'franchise anchor' },
    { playerId: 'pwhl-sarah-nurse', league: 'PWHL', position: 'LW', role: 'skater', overallDelta: 0, price: 2200, ability: 'franchise entry' },
    { playerId: 'pwhl-alex-carpenter', league: 'PWHL', position: 'C', role: 'skater', overallDelta: 0, price: 2250, ability: 'franchise creator' },
    { playerId: 'pwhl-megan-keller', league: 'PWHL', position: 'LD', role: 'skater', overallDelta: 0, price: 2250, ability: 'franchise wall' },
  ]),
  ...eventSet('record-breakers', 'elite', [
    { playerId: 'nhl-nikita-kucherov', league: 'NHL', position: 'RW', role: 'skater', overallDelta: 1, price: 2350, ability: 'record pace' },
    { playerId: 'nhl-david-pastrnak', league: 'NHL', position: 'RW', role: 'skater', overallDelta: -1, price: 2200, ability: 'record release' },
    { playerId: 'nhl-connor-hellebuyck', league: 'NHL', position: 'G', role: 'goalie', overallDelta: 0, price: 2400, ability: 'record consistency' },
    { playerId: 'pwhl-natalie-spooner', league: 'PWHL', position: 'RW', role: 'skater', overallDelta: 1, price: 2300, ability: 'record scoring' },
    { playerId: 'pwhl-kendall-coyne-schofield', league: 'PWHL', position: 'LW', role: 'skater', overallDelta: -1, price: 2150, ability: 'record speed' },
    { playerId: 'pwhl-aerin-frankel', league: 'PWHL', position: 'G', role: 'goalie', overallDelta: 0, price: 2250, ability: 'record recovery' },
  ]),
  ...eventSet('clutch-performers', 'featured', [
    { playerId: 'nhl-kirill-kaprizov', league: 'NHL', position: 'LW', role: 'skater', overallDelta: 0, price: 2200, ability: 'last-shift cut' },
    { playerId: 'nhl-nathan-mackinnon', league: 'NHL', position: 'C', role: 'skater', overallDelta: 1, price: 2350, ability: 'last-shift rush' },
    { playerId: 'nhl-cale-makar', league: 'NHL', position: 'RD', role: 'skater', overallDelta: -1, price: 2250, ability: 'last-shift escape' },
    { playerId: 'pwhl-marie-philip-poulin', league: 'PWHL', position: 'C', role: 'skater', overallDelta: 0, price: 2350, ability: 'last-shift captain' },
    { playerId: 'pwhl-erin-ambrose', league: 'PWHL', position: 'RD', role: 'skater', overallDelta: 1, price: 2250, ability: 'last-shift conductor' },
    { playerId: 'pwhl-ann-renee-desbiens', league: 'PWHL', position: 'G', role: 'goalie', overallDelta: -1, price: 2250, ability: 'last-shift poise' },
  ]),
];

const SKATER_DELTAS: Readonly<Record<EventId, Partial<Record<keyof SkaterAttributes, number>>>> = {
  'frozen-frights': { physicality: 6, defense: 5, speed: -4, puckControl: -2 },
  'signature-series': { hockeyIq: 5, passing: 4, physicality: -3, defense: -2 },
  'winter-holidays': { passing: 6, puckControl: 4, physicality: -4, defense: -2 },
  'winter-classic': { clutch: 5, physicality: 5, puckControl: -4, passing: -2 },
  'international-ice': { speed: 5, passing: 5, physicality: -5, defense: -2 },
  'rising-stars': { puckControl: 6, speed: 4, defense: -4, hockeyIq: -2 },
  'playoff-heroes': { clutch: 7, defense: 4, speed: -3, puckControl: -3 },
  'franchise-icons': { hockeyIq: 6, passing: 3, speed: -4, shooting: -2 },
  'record-breakers': { shooting: 8, speed: 3, defense: -5, physicality: -3 },
  'clutch-performers': { clutch: 8, shooting: 4, physicality: -4, speed: -2 },
};

const GOALIE_DELTAS: Readonly<Record<EventId, Partial<Record<keyof GoalieAttributes, number>>>> = {
  'frozen-frights': { positioning: 5, consistency: 5, puckHandling: -5, reflexes: -2 },
  'signature-series': { consistency: 6, positioning: 3, puckHandling: -3, reboundControl: -2 },
  'winter-holidays': { puckHandling: 6, reboundControl: 4, blocker: -3, positioning: -2 },
  'winter-classic': { clutch: 6, consistency: 4, puckHandling: -4, glove: -2 },
  'international-ice': { puckHandling: 6, reflexes: 3, consistency: -3, positioning: -2 },
  'rising-stars': { reflexes: 6, glove: 4, consistency: -4, positioning: -2 },
  'playoff-heroes': { clutch: 8, positioning: 4, puckHandling: -5, reflexes: -2 },
  'franchise-icons': { consistency: 7, positioning: 3, reflexes: -3, puckHandling: -2 },
  'record-breakers': { reflexes: 8, glove: 4, reboundControl: -4, consistency: -3 },
  'clutch-performers': { clutch: 8, positioning: 4, puckHandling: -4, blocker: -2 },
};

export type EventCardManifestEntry = CardVersion & {
  readonly eventId: EventId;
  readonly league: League;
  readonly position: HockeyPosition;
  readonly eligiblePositions: readonly HockeyPosition[];
};

function adjustAttributes<T extends object>(
  source: T,
  deltas: Partial<Record<keyof T, number>>,
): T {
  const entries = Object.entries(source) as Array<[keyof T, number]>;
  return Object.fromEntries(entries.map(([key, value]) => [
    String(key),
    Math.min(99, Math.max(40, value + Number(deltas[key] ?? 0))),
  ])) as T;
}

export function buildEventCardManifest(
  players: readonly Player[],
  baseCards: readonly CardVersion[],
): readonly EventCardManifestEntry[] {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const baseByPlayer = new Map(baseCards
    .filter((card) => card.cardType === 'base' && card.isPermanent)
    .map((card) => [card.playerId, card]));

  return EVENT_CARD_BLUEPRINTS.map((blueprint) => {
    const player = playersById.get(blueprint.playerId);
    const base = baseByPlayer.get(blueprint.playerId);
    if (!player || !base) throw new TypeError(`Event blueprint references missing base player ${blueprint.playerId}.`);
    if (player.league !== blueprint.league || player.primaryPosition !== blueprint.position || player.role !== blueprint.role || base.role !== blueprint.role) {
      throw new TypeError(`Event blueprint identity mismatch for ${blueprint.playerId}.`);
    }
    const common = {
      id: blueprint.id,
      playerId: blueprint.playerId,
      eventId: blueprint.eventId,
      league: blueprint.league,
      position: blueprint.position,
      eligiblePositions: [...player.eligiblePositions],
      setId: blueprint.eventId,
      cardType: blueprint.cardType,
      overall: Math.min(99, Math.max(40, base.overall + blueprint.overallDelta)),
      abilities: [blueprint.ability],
      price: blueprint.price,
      availableFrom: EVENT_CARD_AVAILABLE_FROM,
      availableTo: EVENT_CARD_AVAILABLE_TO,
      isPermanent: false,
    } as const;
    return base.role === 'skater'
      ? { ...common, role: 'skater' as const, attributes: adjustAttributes(base.attributes, SKATER_DELTAS[blueprint.eventId]) }
      : { ...common, role: 'goalie' as const, attributes: adjustAttributes(base.attributes, GOALIE_DELTAS[blueprint.eventId]) };
  });
}

export function eventCardsFromManifest(
  manifest: readonly EventCardManifestEntry[],
): readonly CardVersion[] {
  return manifest.map(({ eventId: _eventId, league: _league, position: _position, eligiblePositions: _eligiblePositions, ...card }) => card as CardVersion);
}

export function eventManifestCatalogProjection(manifest: readonly EventCardManifestEntry[]): CardCatalog['cards'] {
  return eventCardsFromManifest(manifest);
}
