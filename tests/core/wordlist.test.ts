import { describe, expect, it } from 'vitest';
import { buildWordList, loadWordList, parseWordList, WordListError } from '../../src/core';
import { realWords } from '../helpers';

describe('parseWordList', () => {
  it('trims, lowercases, skips blanks and comments, and removes duplicates', () => {
    const text = '# header\nCrane\n\n  slate \ncrane\r\n# another comment\n';
    expect(parseWordList(text, 'test')).toEqual(['crane', 'slate']);
  });

  it('reports the file and line of an invalid word', () => {
    expect(() => parseWordList('crane\ncran\n', 'words.txt')).toThrow(/words\.txt:2: "cran"/);
    expect(() => parseWordList('cr4ne', 'words.txt')).toThrow(WordListError);
  });
});

describe('buildWordList', () => {
  it('makes every answer an allowed guess and sorts the lists', () => {
    const words = buildWordList(['slate', 'crane'], ['zzzzz']);
    expect(words.answers).toEqual(['crane', 'slate']);
    expect(words.guessPool).toEqual(['crane', 'slate', 'zzzzz']);
    expect(words.allowed.has('crane')).toBe(true);
  });

  it('rejects an empty answers list', () => {
    expect(() => buildWordList([])).toThrow(/empty/);
  });
});

describe('loadWordList', () => {
  it('loads the bundled lists', () => {
    const words = realWords();
    expect(words.answers).toHaveLength(2315);
    expect(words.guessPool.length).toBeGreaterThan(12_000);
  });

  it('gives a clear error for a missing file', () => {
    expect(() => loadWordList('/nope/answers.txt')).toThrow(/Cannot read word list \/nope\/answers\.txt/);
  });
});
