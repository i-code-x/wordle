import { resolve } from 'node:path';
import { loadWordList } from '../src/core';

const root = resolve(import.meta.dirname, '..');

export const fixtureWords = () =>
  loadWordList(resolve(root, 'tests/fixtures/answers.txt'), resolve(root, 'tests/fixtures/allowed.txt'));

export const realWords = () => loadWordList(resolve(root, 'data/answers.txt'), resolve(root, 'data/allowed.txt'));

/** Small seeded PRNG (mulberry32) so property tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Full-list solver tests are slow under coverage instrumentation; `npm run coverage` skips them. */
export const skipSlow = process.env.SKIP_SLOW === '1';
