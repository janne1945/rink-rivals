import { describe, expect, it } from 'vitest';

import {
  applyEventAttributeProfile,
  applyStarterAttributeProfile,
  buildAttributes,
  calculateBaseOveralls,
  starterOverall,
  type RatingCandidate,
} from '../lib/ratingModel';

const baseCandidate: RatingCandidate = {
  id: 'nhl-model-player',
  league: 'NHL',
  role: 'skater',
  position: 'RW',
  archetype: 'sniper',
  sourceRosterStatus: 'active-roster',
  stat: {
    league: 'NHL', sourcePlayerId: '1', role: 'skater', gamesPlayed: 60,
    goals: 30, assists: 25, points: 55, plusMinus: 8, shots: 190,
    blocks: 0, hits: 0, gameWinningGoals: 4, averageTimeOnIceSeconds: 1_050,
    faceoffPercentage: 0, savePercentage: 0, goalsAgainstAverage: 0,
    shutouts: 0, wins: 0, sourceUrl: 'https://example.test/stats',
  },
};

describe('deterministic rating model', () => {
  it('differentiates archetypes at the same OVR', () => {
    const sniper = buildAttributes(baseCandidate, 80);
    const playmaker = buildAttributes({ ...baseCandidate, archetype: 'playmaker' }, 80);
    expect('shooting' in sniper && 'shooting' in playmaker ? sniper.shooting : 0)
      .toBeGreaterThan('shooting' in playmaker ? playmaker.shooting : 99);
    expect('passing' in playmaker && 'passing' in sniper ? playmaker.passing : 0)
      .toBeGreaterThan('passing' in sniper ? sniper.passing : 99);
  });

  it('fails closed on stale overrides and accepts an audited current source rating', () => {
    const candidates = [
      { ...baseCandidate, id: 'nhl-model-a' },
      { ...baseCandidate, id: 'nhl-model-b', stat: { ...baseCandidate.stat!, points: 20, goals: 8 } },
    ];
    const generated = calculateBaseOveralls(candidates).get('nhl-model-a') as number;
    expect(() => calculateBaseOveralls(candidates, [{
      playerId: 'nhl-model-a', sourceGeneratedOverall: generated - 1,
      baseOverall: 80, reason: 'Audited model correction for test coverage.',
    }])).toThrow(/Stale rating override/);
    expect(calculateBaseOveralls(candidates, [{
      playerId: 'nhl-model-a', sourceGeneratedOverall: generated,
      baseOverall: 80, reason: 'Audited model correction for test coverage.',
    }]).get('nhl-model-a')).toBe(80);
    expect(() => calculateBaseOveralls(candidates, [{
      playerId: 'nhl-unknown', sourceGeneratedOverall: generated,
      baseOverall: 80, reason: 'Unknown players must fail the audited override boundary.',
    }])).toThrow(/unknown player/);
  });

  it('applies a real Event strength and tradeoff relative to Base', () => {
    const base = buildAttributes(baseCandidate, 80);
    const generated = buildAttributes(baseCandidate, 86, 'record-breakers');
    const event = applyEventAttributeProfile(base, generated, 'record-breakers', 'skater');
    const deltas = Object.entries(event).map(([key, value]) =>
      value - Number((base as unknown as Record<string, number>)[key]));
    expect(deltas.some((delta) => delta > 0)).toBe(true);
    expect(deltas.some((delta) => delta < 0)).toBe(true);
  });

  it('keeps Starter OVR below Base except at the 68 launch floor', () => {
    expect(() => starterOverall(67, 'invalid-base')).toThrow(/valid launch Base overall/);
    for (let baseOverall = 68; baseOverall <= 86; baseOverall += 1) {
      const overall = starterOverall(baseOverall, `base-${baseOverall}`);
      expect(overall).toBeGreaterThanOrEqual(68);
      expect(overall).toBeLessThanOrEqual(76);
      if (baseOverall === 68) expect(overall).toBe(68);
      else expect(overall).toBeLessThan(baseOverall);
    }
  });

  it('makes a floor-case Starter attribute profile genuinely weaker than Base', () => {
    const base = buildAttributes(baseCandidate, 68, 'base');
    const generated = buildAttributes(baseCandidate, 68, 'starter');
    const starter = applyStarterAttributeProfile(base, generated);
    const deltas = Object.entries(starter).map(([key, value]) =>
      value - Number((base as unknown as Record<string, number>)[key]));
    expect(deltas.every((delta) => delta <= 0)).toBe(true);
    expect(deltas.some((delta) => delta < 0)).toBe(true);
  });
});
