export const WORD_LENGTH = 5;
export const DEFAULT_MAX_GUESSES = 6;

export type Feedback = 'green' | 'yellow' | 'gray';

/** Base-3 encoding of five feedback values: gray=0, yellow=1, green=2, position i weighted 3^i. */
export type Pattern = number;

export type GameStatus = 'in_progress' | 'won' | 'lost';

export interface GuessRecord {
  word: string;
  feedback: Feedback[];
}

export interface WordList {
  /** Possible secret answers, sorted and unique. */
  answers: readonly string[];
  /** Every valid guess: answers plus extra allowed words. */
  allowed: ReadonlySet<string>;
  /** Sorted array of `allowed`, used for solver iteration. */
  guessPool: readonly string[];
}

export interface Suggestion {
  word: string;
  /** Expected information in bits. */
  entropy: number;
  /** Expected number of candidates left after this guess. */
  expectedRemaining: number;
  /** Whether this guess could itself be the answer. */
  isCandidate: boolean;
}
