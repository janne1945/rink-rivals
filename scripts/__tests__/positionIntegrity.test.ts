import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gameCatalog } from '../../src/data/generated/gameCatalog';

interface SourcePositionRow {
  readonly league: 'NHL' | 'PWHL';
  readonly sourcePlayerId: string;
  readonly officialPosition: string;
}

interface PositionEvidence {
  readonly league: 'NHL' | 'PWHL';
  readonly sourcePlayerId: string;
  readonly eligiblePosition: 'LW' | 'C' | 'RW' | 'LD' | 'RD';
  readonly sourceUrl: string;
}

function officialPositions(position: string): string[] {
  switch (position.toUpperCase()) {
    case 'F': return ['LW', 'C', 'RW'];
    case 'D': return ['LD', 'RD'];
    case 'L':
    case 'LW': return ['LW'];
    case 'R':
    case 'RW': return ['RW'];
    case 'C': return ['C'];
    case 'LD': return ['LD'];
    case 'RD': return ['RD'];
    case 'G': return ['G'];
    default: throw new Error(`Unreviewed official position code: ${position}`);
  }
}

describe('reviewed position integrity', () => {
  it('never replaces an official position and only adds source-backed eligibility', () => {
    const snapshot = JSON.parse(readFileSync(
      resolve('data/content/official-content-snapshot.json'),
      'utf8',
    )) as {
      rosterPlayers: SourcePositionRow[];
      rosterCandidates: SourcePositionRow[];
      draftRights: Array<{ league: 'PWHL'; draftYear: number; overallPick: number; officialPosition: string }>;
    };
    const evidence = JSON.parse(readFileSync(
      resolve('data/content/position-evidence.json'),
      'utf8',
    )) as PositionEvidence[];
    const sourceRows = [
      ...snapshot.rosterPlayers,
      ...snapshot.rosterCandidates,
      ...snapshot.draftRights.map((right): SourcePositionRow => ({
        league: right.league,
        sourcePlayerId: `draft-${right.draftYear}-${right.overallPick}`,
        officialPosition: right.officialPosition,
      })),
    ];
    const sourceByKey = new Map(sourceRows.map((row) => [
      `${row.league}:${row.sourcePlayerId}`,
      row,
    ]));
    const evidenceByKey = new Map<string, PositionEvidence[]>();
    for (const row of evidence) {
      const key = `${row.league}:${row.sourcePlayerId}`;
      evidenceByKey.set(key, [...(evidenceByKey.get(key) ?? []), row]);
    }

    for (const player of gameCatalog.players.filter(({ active }) => active)) {
      const sourceId = player.sourceMetadata.sourceIds[0];
      const key = `${player.league}:${sourceId}`;
      const source = sourceByKey.get(key);
      expect(source, `${player.id} must retain an official source position`).toBeDefined();
      const primaryPositions = officialPositions(source?.officialPosition ?? '');
      expect(primaryPositions, `${player.id} cannot replace its official primary position`)
        .toContain(player.primaryPosition);
      const reviewedSecondary = evidenceByKey.get(key) ?? [];
      const expectedEligible = [...new Set([
        ...primaryPositions,
        ...reviewedSecondary.map(({ eligiblePosition }) => eligiblePosition),
      ])].sort();
      expect([...player.eligiblePositions].sort(), `${player.id} has unreviewed position eligibility`)
        .toEqual(expectedEligible);
      for (const row of reviewedSecondary) {
        expect(player.sourceMetadata.sourceUrls).toContain(row.sourceUrl);
        expect(player.sourceMetadata.requiresManualReview).toBe(true);
        expect(player.sourceMetadata.manualReviewReasons.some((reason) =>
          reason.includes(`secondary eligibility ${row.eligiblePosition}`))).toBe(true);
      }
    }

    for (const row of evidence) {
      expect(gameCatalog.players.some((player) =>
        player.active
        && player.league === row.league
        && player.sourceMetadata.sourceIds.includes(row.sourcePlayerId)
        && (player.eligiblePositions as readonly string[]).includes(row.eligiblePosition))).toBe(true);
    }
  });
});
