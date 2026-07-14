import { describe, expect, it } from 'vitest';

import {
  parseSignatureArtwork,
  signatureArtworkAttributes,
} from '../lib/signatureArtwork';

describe('Signature artwork rating projection', () => {
  it('maps every visible skater label and deterministically reuses PLY/DEF for hidden fields', () => {
    const artwork = parseSignatureArtwork({
      role: 'skater',
      position: 'RD',
      overall: 95,
      displayedRatings: { SPD: 97, SHT: 92, PLY: 96, DEF: 97, CLT: 95 },
    });
    if (artwork.role !== 'skater') throw new Error('Expected a skater artwork fixture.');
    expect(signatureArtworkAttributes(artwork)).toEqual({
      speed: 97,
      shooting: 92,
      passing: 96,
      puckControl: 96,
      defense: 97,
      physicality: 97,
      hockeyIq: 96,
      clutch: 95,
    });
  });

  it('maps goalie labels to the goalie schema and rejects incomplete label sets', () => {
    const artwork = parseSignatureArtwork({
      role: 'goalie',
      position: 'G',
      overall: 92,
      displayedRatings: { HGH: 93, LOW: 92, QCK: 93, POS: 91, RBC: 91 },
    });
    if (artwork.role !== 'goalie') throw new Error('Expected a goalie artwork fixture.');
    expect(signatureArtworkAttributes(artwork)).toEqual({
      reflexes: 93,
      positioning: 91,
      glove: 93,
      blocker: 92,
      reboundControl: 91,
      puckHandling: 91,
      consistency: 91,
      clutch: 91,
    });
    expect(() => parseSignatureArtwork({
      role: 'goalie',
      position: 'G',
      overall: 92,
      displayedRatings: { HGH: 93, LOW: 92, QCK: 93, POS: 91 },
    })).toThrow(/labels are invalid/i);
  });
});
