import express, { type Express } from 'express';
import type { WordList } from '../core';
import { errorHandler } from './errors';
import { createRoutes } from './routes';
import { GameStore } from './store';

export interface AppOptions {
  words: WordList;
  store?: GameStore;
  allowFixedAnswer?: boolean;
  random?: () => number;
}

/** Build the API app without listening, so tests can drive it directly. */
export function createApp({ words, store, allowFixedAnswer = false, random = Math.random }: AppOptions): Express {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(
    '/api',
    createRoutes({ words, store: store ?? new GameStore(), allowFixedAnswer, random }),
    errorHandler,
  );
  return app;
}
