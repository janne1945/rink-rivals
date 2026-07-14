import { describe, expect, it } from 'vitest';

import { parseCsv } from '../lib/csv';
import {
  buildImportCandidate,
  parseStatRows,
  type RatingOverride,
  type StatRow,
} from '../lib/importPipeline';

function skaterRow(
  playerId: string,
  season: string,
  points: number,
  gamesPlayed = 24,
): StatRow {
  return {
    player_id: playerId,
    name: playerId === 'nhl-alpha' ? 'Alpha Player' : 'Beta Player',
    league: 'NHL',
    season,
    role: 'skater',
    position: 'C',
    team: 'Test City',
    nationality: 'CAN',
    handedness: 'left',
    games_played: gamesPlayed,
    minutes_played: 0,
    goals: Math.round(points * 0.45),
    assists: Math.round(points * 0.55),
    points,
    shots: points * 3,
    blocks: points,
    hits: points * 1.5,
    plus_minus: points * 0.2,
    game_winning_goals: Math.max(1, Math.round(points * 0.08)),
    save_pct: 0,
    goals_against_average: 0,
    shutouts: 0,
    wins: 0,
  };
}

const seasons = ['2023-24', '2024-25', '2025-26'] as const;

function rows(): StatRow[] {
  return seasons.flatMap((season, index) => [
    skaterRow('nhl-alpha', season, 18 + index * 4),
    skaterRow('nhl-beta', season, 12 + index * 2),
  ]);
}

describe('stats import pipeline', () => {
  it('parses quoted CSV fields and rejects malformed field counts', () => {
    expect(parseCsv('id,name\n1,"Player, One"\n')).toEqual([
      { id: '1', name: 'Player, One' },
    ]);
    expect(() => parseCsv('id,name\n1\n')).toThrow(/expected 2/);
  });

  it('uses explicit 60/30/10 weights and produces a validated review candidate', () => {
    const candidate = buildImportCandidate(rows(), {
      seasons,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(candidate.report.seasonWeights).toEqual({
      '2023-24': 0.1,
      '2024-25': 0.3,
      '2025-26': 0.6,
    });
    expect(candidate.report.approvalStatus).toBe('REQUIRES_MANUAL_REVIEW');
    expect(candidate.catalog.players).toHaveLength(2);
    expect(candidate.catalog.metadata.snapshotDate).toBe('2026-07-13');
    expect(candidate.catalog.players.every(({ sourceMetadata }) =>
      sourceMetadata.snapshotDate === '2026-07-13')).toBe(true);
    expect(candidate.catalog.teams.every(({ sourceMetadata }) =>
      sourceMetadata.snapshotDate === '2026-07-13')).toBe(true);
    expect(candidate.catalog.cards.find(({ playerId }) => playerId === 'nhl-alpha')?.overall)
      .toBeGreaterThan(candidate.catalog.cards.find(({ playerId }) => playerId === 'nhl-beta')?.overall ?? 99);
  });

  it('accepts an explicit reviewed snapshot date and rejects impossible dates', () => {
    const candidate = buildImportCandidate(rows(), {
      seasons,
      generatedAt: '2030-03-04T12:30:00.000Z',
      snapshotDate: '2030-03-01',
    });
    expect(candidate.catalog.metadata.snapshotDate).toBe('2030-03-01');

    expect(() => buildImportCandidate(rows(), {
      seasons,
      generatedAt: '2030-03-04T12:30:00.000Z',
      snapshotDate: '2030-02-30',
    })).toThrow(/Snapshot date/);
  });

  it('renormalizes missing-season weights and preserves an audit trail for overrides', () => {
    const reducedRows = rows().filter(
      (row) => !(row.player_id === 'nhl-alpha' && row.season === '2023-24'),
    );
    const first = buildImportCandidate(reducedRows, { seasons });
    const sourceValue = first.catalog.cards.find(({ playerId }) => playerId === 'nhl-alpha')?.overall;
    expect(sourceValue).toBeDefined();

    const override: RatingOverride = {
      playerId: 'nhl-alpha',
      attribute: 'overall',
      sourceValue: sourceValue ?? 0,
      replacementValue: Math.min(86, (sourceValue ?? 85) + 1),
      reason: 'Verified correction for a missing source statistic.',
    };
    const candidate = buildImportCandidate(reducedRows, { seasons, overrides: [override] });

    expect(candidate.report.warnings).toContain(
      'nhl-alpha: only 2/3 configured seasons available; weights were renormalized',
    );
    expect(candidate.report.appliedOverrides).toEqual([override]);
    expect(candidate.catalog.cards.find(({ playerId }) => playerId === 'nhl-alpha')?.overall)
      .toBe(override.replacementValue);
  });

  it('fails the whole candidate on conflicting identities or stale override values', () => {
    const csvRows = rows().map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])),
    );
    csvRows[1].name = 'Conflicting Name';
    expect(() => parseStatRows(csvRows)).toThrow(/Conflicting name/);

    expect(() =>
      buildImportCandidate(rows(), {
        seasons,
        overrides: [{
          playerId: 'nhl-alpha',
          attribute: 'overall',
          sourceValue: 40,
          replacementValue: 80,
          reason: 'Intentionally stale value for validation.',
        }],
      }),
    ).toThrow(/source mismatch/);
  });
});
