import { describe, expect, it } from 'vitest';
import { filterCandidates, Game, rankGuesses, scoreGuess, type GuessRecord } from '../../src/core';
import { fixtureWords, realWords, seededRandom, skipSlow } from '../helpers';

const record = (word: string, answer: string): GuessRecord => ({ word, feedback: scoreGuess(word, answer) });

describe('filterCandidates', () => {
  const { answers } = fixtureWords();

  it('returns every answer when there are no guesses', () => {
    expect(filterCandidates(answers, [])).toEqual(answers);
  });

  it('keeps only answers consistent with the feedback', () => {
    // crane vs crate/crave both give GGG-G; everything else differs.
    expect(filterCandidates(answers, [record('crane', 'crate')])).toEqual(['crate', 'crave']);
  });

  it('handles repeated letters via the shared scorer', () => {
    // speed vs abide: only one e is yellow, so answers with two unplaced e's are excluded.
    expect(filterCandidates(answers, [record('speed', 'abide')])).toEqual(['abide']);
  });

  it('never removes the true answer (property test on the real lists)', () => {
    const { answers: all, guessPool } = realWords();
    const random = seededRandom(1);
    for (let trial = 0; trial < 300; trial++) {
      const answer = all[Math.floor(random() * all.length)]!;
      const history: GuessRecord[] = [];
      for (let i = 0; i < 3; i++) history.push(record(guessPool[Math.floor(random() * guessPool.length)]!, answer));
      expect(filterCandidates(all, history)).toContain(answer);
    }
  });
});

describe('rankGuesses', () => {
  it('scores a guess that separates every candidate at log2(n) bits', () => {
    // event vs crane/crate/crave gives a different yellow (n, t or v) each time.
    const [best] = rankGuesses(['crane', 'crate', 'crave'], ['crane', 'event'], 1);
    expect(best!.word).toBe('event');
    expect(best!.entropy).toBeCloseTo(Math.log2(3), 12);
    expect(best!.expectedRemaining).toBe(1);
    expect(best!.isCandidate).toBe(false);
  });

  it('matches a hand-computed uneven split', () => {
    // crane vs [crane, crate, crave] → buckets of 1 and 2:
    // H = -(1/3·log2(1/3) + 2/3·log2(2/3)) ≈ 0.9183; expected remaining = (1² + 2²)/3 = 5/3.
    const [s] = rankGuesses(['crane', 'crate', 'crave'], ['crane'], 1);
    expect(s!.entropy).toBeCloseTo(0.918296, 6);
    expect(s!.expectedRemaining).toBeCloseTo(5 / 3, 12);
  });

  it('gives 0 bits to a guess that puts every candidate in one bucket', () => {
    const [s] = rankGuesses(['crate', 'crave'], ['fghij'], 1);
    expect(s!.entropy).toBe(0);
    expect(s!.expectedRemaining).toBe(2);
  });

  it('breaks ties by preferring possible answers, then alphabetically', () => {
    const ranked = rankGuesses(['crave', 'crate'], ['event', 'crave', 'crate'], 3);
    expect(ranked.map((s) => s.entropy)).toEqual([1, 1, 1]);
    expect(ranked.map((s) => s.word)).toEqual(['crate', 'crave', 'event']);
  });

  it('returns the only candidate with 0 bits when one word is left', () => {
    expect(rankGuesses(['crane'], ['soare', 'crane'])).toEqual([
      { word: 'crane', entropy: 0, expectedRemaining: 1, isCandidate: true },
    ]);
  });

  it('returns nothing when no candidates remain', () => {
    expect(rankGuesses([], ['crane'])).toEqual([]);
  });

  it('respects topN and orders by entropy', () => {
    const words = fixtureWords();
    const ranked = rankGuesses(words.answers, words.guessPool, 4);
    expect(ranked).toHaveLength(4);
    // Equal splits can differ in the last float bit; the solver treats those as ties.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.entropy).toBeGreaterThanOrEqual(ranked[i]!.entropy - 1e-9);
    }
  });

  it.skipIf(skipSlow)('finds the known best opener on the full lists', () => {
    const words = realWords();
    const [best] = rankGuesses(words.answers, words.guessPool, 1);
    expect(best!.word).toBe('soare');
    expect(best!.entropy).toBeCloseTo(5.886, 3);
  }, 30_000);

  it('suggests a guess that a game accepts', () => {
    const words = fixtureWords();
    const game = new Game(words, 'trace');
    const [s] = rankGuesses(filterCandidates(words.answers, game.history), words.guessPool, 1);
    expect(() => game.guess(s!.word)).not.toThrow();
  });
});
