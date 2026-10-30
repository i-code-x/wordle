import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { filterCandidates, scoreGuess } from '../../src/core';
import { createApp } from '../../src/server/app';
import { GameStore } from '../../src/server/store';
import { fixtureWords } from '../helpers';

const words = fixtureWords();
const app = createApp({ words, allowFixedAnswer: true });

async function newGame(answer = 'crane'): Promise<string> {
  const res = await request(app).post('/api/games').send({ answer }).expect(201);
  return res.body.id;
}

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

describe('POST /api/games', () => {
  it('starts a game with every answer still possible', async () => {
    const res = await request(app).post('/api/games').expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'in_progress',
      guesses: [],
      maxGuesses: 6,
      remaining: words.answers.length,
      answer: null,
    });
  });

  it('ignores a requested answer unless fixed answers are enabled', async () => {
    const randomApp = createApp({ words, random: () => 0 }); // always picks the first answer
    const res = await request(randomApp).post('/api/games').send({ answer: 'trace' }).expect(201);
    const guess = await request(randomApp).post(`/api/games/${res.body.id}/guesses`).send({ word: 'trace' });
    expect(guess.body.status).toBe('in_progress');
  });

  it('rejects a fixed answer that is not in the answers list', async () => {
    expectError(await request(app).post('/api/games').send({ answer: 'soare' }), 400, 'INVALID_BODY');
  });
});

describe('POST /api/games/:id/guesses', () => {
  it('returns the scored guess, status and remaining count', async () => {
    const id = await newGame('crane');
    const res = await request(app).post(`/api/games/${id}/guesses`).send({ word: 'react' }).expect(200);
    const history = [{ word: 'react', feedback: scoreGuess('react', 'crane') }];
    expect(res.body).toEqual({
      guess: history[0],
      id,
      status: 'in_progress',
      guesses: history,
      maxGuesses: 6,
      remaining: filterCandidates(words.answers, history).length,
      answer: null,
    });
  });

  it('plays a full game to a win and reveals the answer', async () => {
    const id = await newGame('crane');
    await request(app).post(`/api/games/${id}/guesses`).send({ word: 'slate' }).expect(200);
    const res = await request(app).post(`/api/games/${id}/guesses`).send({ word: 'CRANE' }).expect(200);
    expect(res.body.status).toBe('won');
    expect(res.body.answer).toBe('crane');
    expect(res.body.remaining).toBe(1);
  });

  it('reveals the answer after a loss', async () => {
    const id = await newGame('crane');
    let res!: request.Response;
    for (const word of ['slate', 'crate', 'crave', 'trace', 'brine', 'abide']) {
      res = await request(app).post(`/api/games/${id}/guesses`).send({ word });
    }
    expect(res.body.status).toBe('lost');
    expect(res.body.answer).toBe('crane');
  });

  it.each([
    [{ word: 'cran' }, 400, 'INVALID_LENGTH'],
    [{ word: 'cr4ne' }, 400, 'INVALID_CHARACTERS'],
    [{ word: 'zzzzz' }, 422, 'NOT_IN_WORD_LIST'],
    [{}, 400, 'INVALID_BODY'],
    [{ word: 42 }, 400, 'INVALID_BODY'],
  ])('rejects %j with %i %s and keeps the game unchanged', async (body, status, code) => {
    const id = await newGame();
    expectError(await request(app).post(`/api/games/${id}/guesses`).send(body), status, code);
    const state = await request(app).get(`/api/games/${id}`).expect(200);
    expect(state.body.guesses).toEqual([]);
  });

  it('rejects malformed JSON', async () => {
    const id = await newGame();
    const res = await request(app)
      .post(`/api/games/${id}/guesses`)
      .set('Content-Type', 'application/json')
      .send('{"word": ');
    expectError(res, 400, 'INVALID_BODY');
  });

  it('rejects guesses on a finished game with 409', async () => {
    const id = await newGame('crane');
    await request(app).post(`/api/games/${id}/guesses`).send({ word: 'crane' }).expect(200);
    expectError(await request(app).post(`/api/games/${id}/guesses`).send({ word: 'slate' }), 409, 'GAME_OVER');
  });

  it('returns 404 for an unknown game', async () => {
    expectError(await request(app).post('/api/games/nope/guesses').send({ word: 'crane' }), 404, 'GAME_NOT_FOUND');
  });
});

describe('GET /api/games/:id', () => {
  it('returns the current state', async () => {
    const id = await newGame('crane');
    await request(app).post(`/api/games/${id}/guesses`).send({ word: 'slate' });
    const res = await request(app).get(`/api/games/${id}`).expect(200);
    expect(res.body.guesses.map((g: { word: string }) => g.word)).toEqual(['slate']);
    expect(res.body.answer).toBeNull();
  });

  it('returns 404 for an unknown game', async () => {
    expectError(await request(app).get('/api/games/nope'), 404, 'GAME_NOT_FOUND');
  });
});

describe('GET /api/games/:id/hint', () => {
  it('returns the remaining count and ranked suggestions with entropy', async () => {
    const id = await newGame('crane');
    const res = await request(app).get(`/api/games/${id}/hint`).expect(200);
    expect(res.body.remaining).toBe(words.answers.length);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(10);
    for (const s of res.body.suggestions) {
      expect(s).toEqual({
        word: expect.any(String),
        entropy: expect.any(Number),
        expectedRemaining: expect.any(Number),
        isCandidate: expect.any(Boolean),
      });
    }
  });

  it('agrees with filterCandidates after a guess', async () => {
    const id = await newGame('crate');
    await request(app).post(`/api/games/${id}/guesses`).send({ word: 'crane' });
    const res = await request(app).get(`/api/games/${id}/hint`).expect(200);
    const expected = filterCandidates(words.answers, [{ word: 'crane', feedback: scoreGuess('crane', 'crate') }]);
    expect(res.body.remaining).toBe(expected.length);
  });

  it('clamps the top parameter', async () => {
    const id = await newGame();
    expect((await request(app).get(`/api/games/${id}/hint?top=2`)).body.suggestions).toHaveLength(2);
    expect((await request(app).get(`/api/games/${id}/hint?top=0`)).body.suggestions).toHaveLength(1);
    expect((await request(app).get(`/api/games/${id}/hint?top=abc`)).body.suggestions).toHaveLength(10);
  });

  it('returns 409 on a finished game', async () => {
    const id = await newGame('crane');
    await request(app).post(`/api/games/${id}/guesses`).send({ word: 'crane' });
    expectError(await request(app).get(`/api/games/${id}/hint`), 409, 'GAME_OVER');
  });
});

describe('other routes', () => {
  it('reports health', async () => {
    await request(app).get('/api/health').expect(200, { ok: true });
  });

  it('returns a JSON 404 for unknown API paths', async () => {
    expectError(await request(app).get('/api/nope'), 404, 'NOT_FOUND');
  });

  it('turns unexpected errors into a generic 500', async () => {
    const broken = new GameStore();
    broken.get = () => {
      throw new Error('boom');
    };
    const brokenApp = createApp({ words, store: broken });
    const originalError = console.error;
    console.error = () => {};
    try {
      const res = await request(brokenApp).get('/api/games/x');
      expectError(res, 500, 'INTERNAL');
      expect(res.body.error.message).not.toContain('boom');
    } finally {
      console.error = originalError;
    }
  });
});
