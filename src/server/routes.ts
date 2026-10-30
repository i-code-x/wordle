import { Router, type Request } from 'express';
import { filterCandidates, Game, rankGuesses, type GuessRecord, type Suggestion, type WordList } from '../core';
import { ApiError } from './errors';
import type { GameStore } from './store';

export const MAX_HINT_TOP = 50;
const DEFAULT_HINT_TOP = 10;

export interface RouteOptions {
  words: WordList;
  store: GameStore;
  /** Accept `{ answer }` when starting a game. For tests and demos only. */
  allowFixedAnswer: boolean;
  random: () => number;
}

export function createRoutes({ words, store, allowFixedAnswer, random }: RouteOptions): Router {
  const router = Router();

  // The opening ranking is the same for every game and is the slowest one to compute, so compute it once.
  let openingSuggestions: Suggestion[] | undefined;
  const suggest = (history: readonly GuessRecord[], candidates: string[], top: number): Suggestion[] => {
    if (history.length > 0) return rankGuesses(candidates, words.guessPool, top);
    openingSuggestions ??= rankGuesses(candidates, words.guessPool, MAX_HINT_TOP);
    return openingSuggestions.slice(0, top);
  };

  const findGame = (req: Request<{ id: string }>): Game => {
    const game = store.get(req.params.id);
    if (!game) throw new ApiError('GAME_NOT_FOUND', 'That game does not exist or has expired. Start a new game.');
    return game;
  };

  const remaining = (game: Game) => filterCandidates(words.answers, game.history);

  const gameBody = (id: string, game: Game) => {
    const state = game.state;
    return {
      id,
      status: state.status,
      guesses: state.guesses,
      maxGuesses: state.maxGuesses,
      remaining: remaining(game).length,
      answer: state.answer ?? null,
    };
  };

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.post('/games', (req, res) => {
    let answer = words.answers[Math.floor(random() * words.answers.length)]!;
    const requested: unknown = req.body?.answer;
    if (allowFixedAnswer && requested !== undefined) {
      if (typeof requested !== 'string' || !words.answers.includes(requested.trim().toLowerCase())) {
        throw new ApiError('INVALID_BODY', '"answer" must be a word from the answers list.');
      }
      answer = requested;
    }
    const game = new Game(words, answer);
    const id = store.add(game);
    res.status(201).json(gameBody(id, game));
  });

  router.get('/games/:id', (req, res) => {
    res.json(gameBody(req.params.id, findGame(req)));
  });

  router.post('/games/:id/guesses', (req, res) => {
    const game = findGame(req);
    const word: unknown = req.body?.word;
    if (typeof word !== 'string') {
      throw new ApiError('INVALID_BODY', 'Send a JSON body like { "word": "crane" }.');
    }
    const guess = game.guess(word);
    res.json({ guess, ...gameBody(req.params.id, game) });
  });

  router.get('/games/:id/hint', (req, res) => {
    const game = findGame(req);
    if (game.status !== 'in_progress') {
      throw new ApiError('GAME_OVER', 'The game is over, so there is nothing left to hint at.');
    }
    const top = parseTop(req.query.top);
    const candidates = remaining(game);
    const suggestions = suggest(game.history, candidates, top).map((s) => ({
      ...s,
      entropy: round(s.entropy, 3),
      expectedRemaining: round(s.expectedRemaining, 2),
    }));
    res.json({ remaining: candidates.length, suggestions });
  });

  router.use((_req, _res) => {
    throw new ApiError('NOT_FOUND', 'No such API endpoint.');
  });

  return router;
}

function parseTop(raw: unknown): number {
  if (raw === undefined) return DEFAULT_HINT_TOP;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HINT_TOP;
  return Math.min(MAX_HINT_TOP, Math.max(1, Math.floor(n)));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
