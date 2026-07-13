export type SeededRandom = () => number;

function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRandom(seed: string | number): SeededRandom {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(seed: string | number, minimum: number, maximum: number): number {
  return minimum + createSeededRandom(seed)() * (maximum - minimum);
}

export function randomIndex(seed: string | number, length: number): number {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error('A positive collection length is required.');
  }
  return Math.floor(createSeededRandom(seed)() * length);
}

export function shuffleSeeded<T>(values: readonly T[], seed: string | number): T[] {
  const shuffled = [...values];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
