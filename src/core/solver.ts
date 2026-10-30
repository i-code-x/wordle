import { encodePattern, PATTERN_COUNT, scoreCodes, toCodes } from './score';
import type { GuessRecord, Suggestion } from './types';

/** Entropies closer than this are treated as equal so float noise can't reorder ties. */
const EPSILON = 1e-9;

/**
 * The answers still possible: those that would have produced exactly the observed
 * feedback for every guess so far. Uses the same scorer as the game, so repeated
 * letters need no special handling.
 */
export function filterCandidates(answers: readonly string[], history: readonly GuessRecord[]): string[] {
  const constraints = history.map((h) => ({ codes: toCodes(h.word), pattern: encodePattern(h.feedback) }));
  return answers.filter((answer) => {
    const codes = toCodes(answer);
    return constraints.every((c) => scoreCodes(c.codes, codes) === c.pattern);
  });
}

/**
 * Rank every word in `guessPool` by the entropy of the feedback pattern it would
 * produce across `candidates`, and return the best `topN`.
 *
 * For a guess g splitting n candidates into buckets of size k_p:
 *   H(g) = -Σ (k_p / n) log2(k_p / n)
 *   expectedRemaining(g) = Σ k_p² / n
 *
 * Ties are broken by preferring guesses that could be the answer, then alphabetically.
 */
export function rankGuesses(
  candidates: readonly string[],
  guessPool: readonly string[],
  topN = 10,
): Suggestion[] {
  const n = candidates.length;
  if (n === 0 || topN <= 0) return [];
  if (n === 1) {
    return [{ word: candidates[0]!, entropy: 0, expectedRemaining: 1, isCandidate: true }];
  }

  const candidateSet = new Set(candidates);
  const candidateCodes = candidates.map(toCodes);
  const buckets = new Uint16Array(PATTERN_COUNT);
  const scored: Suggestion[] = [];

  for (const word of guessPool) {
    const guessCodes = toCodes(word);
    buckets.fill(0);
    for (const answerCodes of candidateCodes) buckets[scoreCodes(guessCodes, answerCodes)]!++;

    let entropy = 0;
    let sumSquares = 0;
    for (let p = 0; p < PATTERN_COUNT; p++) {
      const k = buckets[p]!;
      if (k === 0) continue;
      const prob = k / n;
      entropy -= prob * Math.log2(prob);
      sumSquares += k * k;
    }
    scored.push({
      word,
      entropy,
      expectedRemaining: sumSquares / n,
      isCandidate: candidateSet.has(word),
    });
  }

  scored.sort(compareSuggestions);
  return scored.slice(0, topN);
}

function compareSuggestions(a: Suggestion, b: Suggestion): number {
  if (Math.abs(a.entropy - b.entropy) > EPSILON) return b.entropy - a.entropy;
  if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
  return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
}
