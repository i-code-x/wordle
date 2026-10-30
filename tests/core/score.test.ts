import { describe, expect, it } from 'vitest';
import {
  ALL_GREEN,
  decodePattern,
  encodePattern,
  scoreGuess,
  scorePattern,
  type Feedback,
} from '../../src/core';
import { realWords, seededRandom } from '../helpers';

const short: Record<string, Feedback> = { G: 'green', Y: 'yellow', '-': 'gray' };
const expand = (s: string) => [...s].map((c) => short[c]!);

/**
 * Independent reference scorer, written differently from the real one on purpose:
 * a non-green guess letter at i is yellow iff the answer has more unmatched copies of
 * that letter than there are earlier non-green copies of it in the guess.
 */
function referenceScore(guess: string, answer: string): Feedback[] {
  const green = [...guess].map((ch, i) => ch === answer[i]);
  return [...guess].map((ch, i) => {
    if (green[i]) return 'green';
    const unmatchedInAnswer = [...answer].filter((a, j) => a === ch && !green[j]).length;
    const earlierInGuess = [...guess].slice(0, i).filter((g, j) => g === ch && !green[j]).length;
    return unmatchedInAnswer > earlierInGuess ? 'yellow' : 'gray';
  });
}

describe('scoreGuess', () => {
  // Expected values worked out by hand; see docs/technical-requirement.md §10.1.
  it.each([
    ['crane', 'crane', 'GGGGG', 'exact match'],
    ['fghij', 'crane', '-----', 'no shared letters'],
    ['react', 'crane', 'YYGY-', 'yellows in the wrong positions'],
    ['speed', 'abide', '--Y-Y', 'two e in guess, one in answer: only the first is yellow'],
    ['eerie', 'elder', 'GYY--', 'three e in guess, two in answer: green uses one first'],
    ['allee', 'eagle', 'YY-YG', 'repeats on both sides'],
    ['llama', 'hello', 'YY---', 'two l in guess and answer, none in place'],
    ['hello', 'llama', '--YY-', 'reverse of the above'],
    ['abbey', 'babes', 'YYGG-', 'a green b and a yellow b'],
    ['sassy', 'mossy', '--GGG', 'three s in guess, two in answer, both green'],
  ])('%s vs %s → %s (%s)', (guess, answer, expected) => {
    expect(scoreGuess(guess, answer)).toEqual(expand(expected));
  });

  it('agrees with the reference scorer on 20,000 random pairs', () => {
    // A 6-letter alphabet forces lots of repeated letters.
    const random = seededRandom(42);
    const word = () => Array.from({ length: 5 }, () => 'abcdef'[Math.floor(random() * 6)]).join('');
    for (let i = 0; i < 20_000; i++) {
      const guess = word();
      const answer = word();
      expect(scoreGuess(guess, answer), `${guess} vs ${answer}`).toEqual(referenceScore(guess, answer));
    }
  });

  it('agrees with the reference scorer on real words', () => {
    const { answers, guessPool } = realWords();
    const random = seededRandom(7);
    for (let i = 0; i < 5_000; i++) {
      const guess = guessPool[Math.floor(random() * guessPool.length)]!;
      const answer = answers[Math.floor(random() * answers.length)]!;
      expect(scoreGuess(guess, answer), `${guess} vs ${answer}`).toEqual(referenceScore(guess, answer));
    }
  });

  it('scores every answer against itself as all green', () => {
    for (const word of realWords().answers) expect(scorePattern(word, word)).toBe(ALL_GREEN);
  });
});

describe('pattern encoding', () => {
  it('round-trips every pattern', () => {
    for (let p = 0; p <= ALL_GREEN; p++) expect(encodePattern(decodePattern(p))).toBe(p);
  });

  it('uses gray=0, yellow=1, green=2 with position i weighted 3^i', () => {
    expect(encodePattern(expand('-----'))).toBe(0);
    expect(encodePattern(expand('GGGGG'))).toBe(242);
    expect(encodePattern(expand('Y----'))).toBe(1);
    expect(encodePattern(expand('----G'))).toBe(2 * 81);
  });

  it('matches scoreGuess', () => {
    expect(scorePattern('react', 'crane')).toBe(encodePattern(scoreGuess('react', 'crane')));
  });
});
