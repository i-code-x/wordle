import type { ErrorRequestHandler } from 'express';
import { GameError, type GameErrorCode } from '../core';

export type ApiErrorCode = GameErrorCode | 'INVALID_BODY' | 'GAME_NOT_FOUND' | 'NOT_FOUND' | 'INTERNAL';

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_BODY: 400,
  INVALID_LENGTH: 400,
  INVALID_CHARACTERS: 400,
  NOT_IN_WORD_LIST: 422,
  GAME_NOT_FOUND: 404,
  NOT_FOUND: 404,
  GAME_OVER: 409,
  INTERNAL: 500,
};

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}

/** The single place where errors become HTTP responses: `{ error: { code, message } }`. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let apiError: ApiError;
  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof GameError) {
    apiError = new ApiError(err.code, err.message);
  } else if (isBodyParseError(err)) {
    apiError = new ApiError('INVALID_BODY', 'The request body must be valid JSON.');
  } else {
    console.error(err);
    apiError = new ApiError('INTERNAL', 'Something went wrong on the server.');
  }
  res.status(apiError.status).json({ error: { code: apiError.code, message: apiError.message } });
};

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
