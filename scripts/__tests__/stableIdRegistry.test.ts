import { describe, expect, it } from 'vitest';

import { createStableIdResolver } from '../lib/stableIdRegistry';

function registry() {
  return {
    metadata: {
      schemaVersion: 1,
      reviewedAt: '2026-07-14',
      rowFormat: '[league, sourceId, stableId, displayNameAliases]',
      strategy: 'Official source IDs retain permanent internal IDs while reviewed display aliases evolve.',
      starterOverallFloorExceptionPlayerIds: [
        'nhl-michael-dipietro',
        'nhl-arttu-hyry',
        'nhl-max-jones',
        'nhl-garnet-hathaway',
        'nhl-nils-hoglander',
        'nhl-brandon-duhaime',
      ],
    },
    teams: [['NHL', '1', 'nhl-example-team', ['Old Team Name', 'New Team Name']]],
    players: [['NHL', '99', 'nhl-example-player', ['Old Player Name', 'New Player Name']]],
  };
}

describe('stable ID registry', () => {
  it('keeps IDs fixed when a reviewed display-name alias changes', () => {
    const resolver = createStableIdResolver(registry());
    expect(resolver.resolveTeam('NHL', '1', 'Old Team Name')).toBe('nhl-example-team');
    expect(resolver.resolveTeam('NHL', '1', 'New Team Name')).toBe('nhl-example-team');
    expect(resolver.resolvePlayer('NHL', '99', 'Old Player Name')).toBe('nhl-example-player');
    expect(resolver.resolvePlayer('NHL', '99', 'New Player Name')).toBe('nhl-example-player');
  });

  it('fails closed for unreviewed source IDs and display names', () => {
    const resolver = createStableIdResolver(registry());
    expect(() => resolver.resolvePlayer('NHL', '100', 'New Player')).toThrow(/Unreviewed player source ID/);
    expect(() => resolver.resolvePlayer('NHL', '99', 'Unreviewed Rename')).toThrow(/Unreviewed display name/);
  });

  it('rejects duplicate source mappings', () => {
    const input = registry();
    input.players.push(['NHL', '99', 'nhl-other-player', ['Other Player']]);
    expect(() => createStableIdResolver(input)).toThrow(/Duplicate player source ID/);
  });
});
