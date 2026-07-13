import { describe, expect, it } from 'vitest';

import { createSeededRandom, shuffleSeeded } from '../rng';

describe('seeded random helpers', () => {
  it('replays the same sequence from the same seed', () => {
    const first = createSeededRandom('rink-rivals');
    const second = createSeededRandom('rink-rivals');

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it('shuffles without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const shuffled = shuffleSeeded(input, 'shuffle');

    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled).toEqual(shuffleSeeded(input, 'shuffle'));
    expect([...shuffled].sort()).toEqual(input);
  });
});
