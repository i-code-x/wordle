import { describe, expect, it } from 'vitest';
import { Game, GameError } from '../../src/core';
import { fixtureWords } from '../helpers';

const words = fixtureWords();

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`Expected GameError ${code}`);
}

describe('Game', () => {
  it('starts in progress with no guesses and hides the answer', () => {
    const game = new Game(words, 'crane');
    expect(game.state).toEqual({ status: 'in_progress', guesses: [], maxGuesses: 6 });
  });

  it('scores guesses and records them', () => {
    const game = new Game(words, 'crane');
    const record = game.guess('react');
    expect(record.feedback).toEqual(['yellow', 'yellow', 'green', 'yellow', 'gray']);
    expect(game.state.guesses).toEqual([record]);
  });

  it('wins on the correct word, reveals the answer, and refuses more guesses', () => {
    const game = new Game(words, 'crane');
    game.guess('slate');
    game.guess('crane');
    expect(game.status).toBe('won');
    expect(game.state.answer).toBe('crane');
    expectGameError(() => game.guess('crate'), 'GAME_OVER');
  });

  it('loses after the maximum number of guesses', () => {
    const game = new Game(words, 'crane');
    for (const w of ['slate', 'crate', 'crave', 'trace', 'brine']) game.guess(w);
    expect(game.status).toBe('in_progress');
    game.guess('abide');
    expect(game.status).toBe('lost');
    expect(game.state.answer).toBe('crane');
    expectGameError(() => game.guess('crane'), 'GAME_OVER');
  });

  it('wins on the last allowed guess rather than losing', () => {
    const game = new Game(words, 'crane', { maxGuesses: 2 });
    game.guess('slate');
    game.guess('crane');
    expect(game.status).toBe('won');
  });

  it.each([
    ['cran', 'INVALID_LENGTH'],
    ['cranes', 'INVALID_LENGTH'],
    ['', 'INVALID_LENGTH'],
    ['cr4ne', 'INVALID_CHARACTERS'],
    ['cr ne', 'INVALID_CHARACTERS'],
    ['zzzzz', 'NOT_IN_WORD_LIST'],
  ])('rejects %j with %s and does not use an attempt', (input, code) => {
    const game = new Game(words, 'crane');
    expectGameError(() => game.guess(input), code);
    expect(game.state.guesses).toHaveLength(0);
  });

  it('normalises case and surrounding whitespace', () => {
    const game = new Game(words, 'crane');
    expect(game.guess('  CRANE ').word).toBe('crane');
    expect(game.status).toBe('won');
  });

  it('allows extra guess words that are not answers', () => {
    const game = new Game(words, 'crane');
    expect(game.isAllowed('soare')).toBe(true);
    expect(game.guess('soare').word).toBe('soare');
  });

  it('counts a repeated guess as an attempt', () => {
    const game = new Game(words, 'crane');
    game.guess('slate');
    game.guess('slate');
    expect(game.state.guesses).toHaveLength(2);
  });

  it('rejects an answer outside the answers list', () => {
    expect(() => new Game(words, 'soare')).toThrow(/not in the answers list/);
  });

  it('returns a copy of the state, so callers cannot change the game', () => {
    const game = new Game(words, 'crane');
    game.guess('slate');
    game.state.guesses.pop();
    expect(game.state.guesses).toHaveLength(1);
  });
});
