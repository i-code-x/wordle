import { readFileSync } from 'node:fs';
import { WORD_LENGTH, type WordList } from './types';

const WORD_RE = new RegExp(`^[a-z]{${WORD_LENGTH}}$`);

export class WordListError extends Error {
  override name = 'WordListError';
}

/**
 * Parse a word list: one word per line, blank lines and `#` comments ignored,
 * words trimmed and lowercased. Duplicates are dropped. Throws on any invalid word.
 */
export function parseWordList(text: string, source: string): string[] {
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const word = line.trim().toLowerCase();
    if (word === '' || word.startsWith('#')) return;
    if (!WORD_RE.test(word)) {
      throw new WordListError(
        `${source}:${index + 1}: "${line.trim()}" is not a ${WORD_LENGTH}-letter a-z word`,
      );
    }
    seen.add(word);
  });
  return [...seen];
}

/** Combine answers and extra guesses into a WordList. Answers are always allowed guesses. */
export function buildWordList(answers: readonly string[], extraGuesses: readonly string[] = []): WordList {
  const uniqueAnswers = [...new Set(answers)].sort();
  if (uniqueAnswers.length === 0) {
    throw new WordListError('The answers list is empty');
  }
  const allowed = new Set([...uniqueAnswers, ...extraGuesses]);
  return {
    answers: uniqueAnswers,
    allowed,
    guessPool: [...allowed].sort(),
  };
}

/** Load a WordList from disk. `allowedPath` is optional; without it only answers are valid guesses. */
export function loadWordList(answersPath: string, allowedPath?: string): WordList {
  const answers = parseWordList(readText(answersPath), answersPath);
  const extra = allowedPath ? parseWordList(readText(allowedPath), allowedPath) : [];
  return buildWordList(answers, extra);
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    throw new WordListError(`Cannot read word list ${path}: ${(err as Error).message}`);
  }
}
