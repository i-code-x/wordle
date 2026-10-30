import { scoreGuess } from './score';
import {
  DEFAULT_MAX_GUESSES,
  WORD_LENGTH,
  type GameStatus,
  type GuessRecord,
  type WordList,
} from './types';

export type GameErrorCode = 'INVALID_LENGTH' | 'INVALID_CHARACTERS' | 'NOT_IN_WORD_LIST' | 'GAME_OVER';

export class GameError extends Error {
  override name = 'GameError';
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface GameState {
  status: GameStatus;
  guesses: GuessRecord[];
  maxGuesses: number;
  /** Only present once the game is over. */
  answer?: string;
}

export interface GameOptions {
  maxGuesses?: number;
}

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/**
 * One game of Wordle. The caller chooses the answer, which keeps the game deterministic.
 * Invalid guesses throw a GameError and do not use up an attempt.
 */
export class Game {
  readonly maxGuesses: number;
  private readonly guesses: GuessRecord[] = [];
  private currentStatus: GameStatus = 'in_progress';

  constructor(
    private readonly words: WordList,
    private readonly answer: string,
    options: GameOptions = {},
  ) {
    const normalized = normalizeWord(answer);
    if (!words.answers.includes(normalized)) {
      throw new Error(`Answer "${answer}" is not in the answers list`);
    }
    this.answer = normalized;
    this.maxGuesses = options.maxGuesses ?? DEFAULT_MAX_GUESSES;
  }

  get status(): GameStatus {
    return this.currentStatus;
  }

  get history(): readonly GuessRecord[] {
    return this.guesses;
  }

  isAllowed(word: string): boolean {
    return this.words.allowed.has(normalizeWord(word));
  }

  guess(input: string): GuessRecord {
    if (this.currentStatus !== 'in_progress') {
      throw new GameError('GAME_OVER', `The game is over: you ${this.currentStatus}.`);
    }
    const word = normalizeWord(input);
    if (word.length !== WORD_LENGTH) {
      throw new GameError('INVALID_LENGTH', `Guesses must be ${WORD_LENGTH} letters long.`);
    }
    if (!/^[a-z]+$/.test(word)) {
      throw new GameError('INVALID_CHARACTERS', 'Guesses may only contain the letters A to Z.');
    }
    if (!this.words.allowed.has(word)) {
      throw new GameError('NOT_IN_WORD_LIST', `"${word}" is not in the word list.`);
    }

    const record: GuessRecord = { word, feedback: scoreGuess(word, this.answer) };
    this.guesses.push(record);
    if (word === this.answer) this.currentStatus = 'won';
    else if (this.guesses.length >= this.maxGuesses) this.currentStatus = 'lost';
    return record;
  }

  get state(): GameState {
    const state: GameState = {
      status: this.currentStatus,
      guesses: this.guesses.map((g) => ({ word: g.word, feedback: [...g.feedback] })),
      maxGuesses: this.maxGuesses,
    };
    if (this.currentStatus !== 'in_progress') state.answer = this.answer;
    return state;
  }
}
