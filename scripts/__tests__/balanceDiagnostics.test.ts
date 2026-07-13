import { describe, expect, it } from 'vitest';

import { gameCatalog, starterLineups } from '../../src/data/generated/gameCatalog';
import { runBalanceDiagnostics } from '../lib/balanceDiagnostics';

describe('balance diagnostics', () => {
  it('is reproducible for the same seed and reports both leagues', () => {
    const first = runBalanceDiagnostics(gameCatalog, starterLineups, 20, 'repeatable');
    const second = runBalanceDiagnostics(gameCatalog, starterLineups, 20, 'repeatable');

    expect(second).toEqual(first);
    expect(first.matches).toBe(40);
    expect(first.wins.NHL + first.wins.PWHL + first.wins.tie).toBe(first.matches);
    expect(first.averageBaseOverall.NHL).toBeGreaterThan(0);
    expect(first.averageBaseOverall.PWHL).toBeGreaterThan(0);
    expect(first.leagueWinRateGap).toBeLessThanOrEqual(0.1);
    expect(Object.keys(first.situationResults)).toContain('goalie-showdown');
  });
});
