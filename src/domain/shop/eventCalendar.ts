import { createEventShopRotation } from './eventRotation';
import type {
  EventCalendarDefinition,
  EventCalendarRotation,
  MarketCard,
} from './types';

const WEEK_IN_MS = 7 * 86_400_000;

/** Monday 00:00 UTC. Event order repeats every ten weeks from this anchor. */
export const EVENT_CALENDAR_ANCHOR = '2026-01-05T00:00:00.000Z';

export const EVENT_IDS = [
  'frozen-frights',
  'signature-series',
  'winter-holidays',
  'winter-classic',
  'international-ice',
  'rising-stars',
  'playoff-heroes',
  'franchise-icons',
  'record-breakers',
  'clutch-performers',
] as const;

export type EventId = (typeof EVENT_IDS)[number];

const RECURRENCE_WEEKS = EVENT_IDS.length;

export const EVENT_CALENDAR = [
  {
    id: 'frozen-frights',
    name: 'Frozen Frights',
    description: 'Heavy forechecking, shutdown reads, and fearless crease work.',
    visual: { accentColor: '#9cf06b', surfaceColor: '#18251d', emblem: 'ghost-puck', motif: 'frosted-scratches' },
    gameplay: { headlineAttribute: 'physicality', supportingAttribute: 'defense', tradeoffAttribute: 'speed', summary: 'Physical and defensive specialists trade some transition speed for pressure.' },
  },
  {
    id: 'signature-series',
    name: 'Signature Series',
    description: 'Recognizable strengths sharpened into distinct player signatures.',
    visual: { accentColor: '#f1d47a', surfaceColor: '#262014', emblem: 'signature', motif: 'gold-ink' },
    gameplay: { headlineAttribute: 'hockeyIq', supportingAttribute: 'passing', tradeoffAttribute: 'physicality', summary: 'Elite reads and playmaking define each player without a blanket rating boost.' },
  },
  {
    id: 'winter-holidays',
    name: 'Winter Holidays',
    description: 'Creative puck movement and calm sequences built for shared ice.',
    visual: { accentColor: '#e95f68', surfaceColor: '#1e2c33', emblem: 'snowflake', motif: 'holiday-lights' },
    gameplay: { headlineAttribute: 'passing', supportingAttribute: 'puckControl', tradeoffAttribute: 'physicality', summary: 'Puck movement rises while board-battle strength gives way.' },
  },
  {
    id: 'winter-classic',
    name: 'Winter Classic',
    description: 'Outdoor hockey rewards composure, contact, and one decisive moment.',
    visual: { accentColor: '#d6ede4', surfaceColor: '#263c36', emblem: 'outdoor-rink', motif: 'snow-lines' },
    gameplay: { headlineAttribute: 'clutch', supportingAttribute: 'physicality', tradeoffAttribute: 'puckControl', summary: 'Big-moment strength comes with less polished possession.' },
  },
  {
    id: 'international-ice',
    name: 'International Ice',
    description: 'Open lanes favor speed, vision, and national-team creativity.',
    visual: { accentColor: '#6db8ff', surfaceColor: '#14263a', emblem: 'globe-puck', motif: 'latitude-lines' },
    gameplay: { headlineAttribute: 'speed', supportingAttribute: 'passing', tradeoffAttribute: 'physicality', summary: 'Fast, creative profiles thrive in space and sacrifice some contact strength.' },
  },
  {
    id: 'rising-stars',
    name: 'Rising Stars',
    description: 'Fast-developing talent attacks with energy and confident hands.',
    visual: { accentColor: '#dca7ff', surfaceColor: '#251735', emblem: 'rising-star', motif: 'light-trails' },
    gameplay: { headlineAttribute: 'puckControl', supportingAttribute: 'speed', tradeoffAttribute: 'defense', summary: 'Dynamic creation is balanced by less settled defensive detail.' },
  },
  {
    id: 'playoff-heroes',
    name: 'Playoff Heroes',
    description: 'Pressure-tested cards lean into decisive shifts and defensive detail.',
    visual: { accentColor: '#ff9d55', surfaceColor: '#302019', emblem: 'hero-shield', motif: 'spotlight-rays' },
    gameplay: { headlineAttribute: 'clutch', supportingAttribute: 'defense', tradeoffAttribute: 'speed', summary: 'Late-game execution and coverage replace some regular-season pace.' },
  },
  {
    id: 'franchise-icons',
    name: 'Franchise Icons',
    description: 'Complete, composed identities built around durable hockey intelligence.',
    visual: { accentColor: '#f2cf70', surfaceColor: '#252116', emblem: 'heritage-crest', motif: 'banner-stripes' },
    gameplay: { headlineAttribute: 'hockeyIq', supportingAttribute: 'consistency', tradeoffAttribute: 'speed', summary: 'Reliable reads and positioning matter more than raw acceleration.' },
  },
  {
    id: 'record-breakers',
    name: 'Record Breakers',
    description: 'One exceptional skill reaches a peak while the rest of the profile stays honest.',
    visual: { accentColor: '#ffdb4d', surfaceColor: '#2c2711', emblem: 'record-burst', motif: 'number-grid' },
    gameplay: { headlineAttribute: 'shooting', supportingAttribute: 'reflexes', tradeoffAttribute: 'defense', summary: 'A signature peak is offset elsewhere instead of raising every attribute.' },
  },
  {
    id: 'clutch-performers',
    name: 'Clutch Performers',
    description: 'Close games reward finishing touch, poise, and repeatable late-shift execution.',
    visual: { accentColor: '#ff6b8f', surfaceColor: '#321724', emblem: 'final-horn', motif: 'score-clock' },
    gameplay: { headlineAttribute: 'clutch', supportingAttribute: 'shooting', tradeoffAttribute: 'physicality', summary: 'Decisive execution improves without turning every card into a power upgrade.' },
  },
].map((event) => ({
  ...event,
  rotation: {
    durationWeeks: 1 as const,
    recurrenceWeeks: RECURRENCE_WEEKS,
    offerCount: 6,
    spotlightDiscountPercent: 15,
    seed: `rink-rivals:${event.id}:v1`,
  },
})) as readonly (EventCalendarDefinition & { readonly id: EventId })[];

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getEventCalendarWeekIndex(at: Date): number {
  const timestamp = at.getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('Event calendar date must be valid.');
  return Math.floor((timestamp - Date.parse(EVENT_CALENDAR_ANCHOR)) / WEEK_IN_MS);
}

export function getActiveEvent(at: Date): EventCalendarDefinition & { readonly id: EventId } {
  const weekIndex = getEventCalendarWeekIndex(at);
  return EVENT_CALENDAR[positiveModulo(weekIndex, EVENT_CALENDAR.length)];
}

/** Resolves the active recurring event and its deterministic, availability-filtered offers. */
export function resolveEventCalendarRotation(
  cards: readonly MarketCard[],
  at: Date,
): EventCalendarRotation {
  const weekIndex = getEventCalendarWeekIndex(at);
  const event = getActiveEvent(at);
  const shop = createEventShopRotation(
    {
      seed: event.rotation.seed,
      eventSetId: event.id,
      periodDays: event.rotation.durationWeeks * 7,
      periodAnchor: EVENT_CALENDAR_ANCHOR,
      offerCount: event.rotation.offerCount,
      spotlightDiscountPercent: event.rotation.spotlightDiscountPercent,
    },
    cards,
    at,
  );
  return { event, weekIndex, shop };
}
