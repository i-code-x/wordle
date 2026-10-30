import type { GameStatus, GuessRecord, Suggestion } from '../core';

export interface GameResponse {
  id: string;
  status: GameStatus;
  guesses: GuessRecord[];
  maxGuesses: number;
  remaining: number;
  answer: string | null;
}

export interface GuessResponse extends GameResponse {
  guess: GuessRecord;
}

export interface HintResponse {
  remaining: number;
  suggestions: Suggestion[];
}

/** Every failure the UI can see: an API error with a code, or a network failure. */
export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RequestError('NETWORK', "Can't reach the server. Try again.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new RequestError('BAD_RESPONSE', `The server sent an unexpected response (${response.status}).`);
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } }).error;
    throw new RequestError(error?.code ?? 'UNKNOWN', error?.message ?? `Request failed (${response.status}).`);
  }
  return data as T;
}

export const api = {
  newGame: () => request<GameResponse>('POST', '/games'),
  getGame: (id: string) => request<GameResponse>('GET', `/games/${encodeURIComponent(id)}`),
  guess: (id: string, word: string) =>
    request<GuessResponse>('POST', `/games/${encodeURIComponent(id)}/guesses`, { word }),
  hint: (id: string, top = 10) => request<HintResponse>('GET', `/games/${encodeURIComponent(id)}/hint?top=${top}`),
};
