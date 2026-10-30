import { WORD_LENGTH, type Feedback, type Pattern } from './types';

export const ALL_GREEN: Pattern = 3 ** WORD_LENGTH - 1; // 242
export const PATTERN_COUNT = 3 ** WORD_LENGTH; // 243

const FEEDBACK_DIGIT: Record<Feedback, number> = { gray: 0, yellow: 1, green: 2 };
const DIGIT_FEEDBACK: Feedback[] = ['gray', 'yellow', 'green'];

/** Letter codes 0..25 for a lowercase word. */
export function toCodes(word: string): Uint8Array {
  const codes = new Uint8Array(WORD_LENGTH);
  for (let i = 0; i < WORD_LENGTH; i++) codes[i] = word.charCodeAt(i) - 97;
  return codes;
}

// Scratch buffer reused across calls: count of answer letters not matched by a green.
const unmatched = new Uint8Array(26);

/**
 * Score a guess against an answer, both given as letter codes, returning the base-3 pattern.
 * This is the solver's hot path, so it allocates nothing.
 *
 * Pass 1 marks greens and counts the answer letters left over. Pass 2 gives each remaining
 * guess letter a yellow only while unmatched copies of that letter remain, so repeated
 * letters never receive more yellows than the answer can account for.
 */
export function scoreCodes(guess: ArrayLike<number>, answer: ArrayLike<number>): Pattern {
  let greenMask = 0;
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) greenMask |= 1 << i;
    else unmatched[answer[i]!]!++;
  }

  let pattern = 0;
  let weight = 1;
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (greenMask & (1 << i)) {
      pattern += 2 * weight;
    } else {
      const letter = guess[i]!;
      if (unmatched[letter]! > 0) {
        unmatched[letter]!--;
        pattern += weight;
      }
    }
    weight *= 3;
  }

  for (let i = 0; i < WORD_LENGTH; i++) unmatched[answer[i]!] = 0;
  return pattern;
}

export function scorePattern(guess: string, answer: string): Pattern {
  return scoreCodes(toCodes(guess), toCodes(answer));
}

export function scoreGuess(guess: string, answer: string): Feedback[] {
  return decodePattern(scorePattern(guess, answer));
}

export function encodePattern(feedback: readonly Feedback[]): Pattern {
  let pattern = 0;
  for (let i = feedback.length - 1; i >= 0; i--) {
    pattern = pattern * 3 + FEEDBACK_DIGIT[feedback[i]!];
  }
  return pattern;
}

export function decodePattern(pattern: Pattern): Feedback[] {
  const feedback: Feedback[] = [];
  for (let i = 0; i < WORD_LENGTH; i++) {
    feedback.push(DIGIT_FEEDBACK[pattern % 3]!);
    pattern = Math.floor(pattern / 3);
  }
  return feedback;
}
