import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core';
import { GameStore } from '../../src/server/store';
import { fixtureWords } from '../helpers';

const words = fixtureWords();
const game = () => new Game(words, 'crane');

describe('GameStore', () => {
  it('stores and returns games by id', () => {
    const store = new GameStore();
    const g = game();
    const id = store.add(g);
    expect(store.get(id)).toBe(g);
    expect(store.get('unknown')).toBeUndefined();
  });

  it('evicts the least recently used game past the limit', () => {
    const store = new GameStore({ maxGames: 2 });
    const a = store.add(game());
    const b = store.add(game());
    store.get(a); // a is now more recent than b
    const c = store.add(game());
    expect(store.size).toBe(2);
    expect(store.get(b)).toBeUndefined();
    expect(store.get(a)).toBeDefined();
    expect(store.get(c)).toBeDefined();
  });

  it('expires games idle longer than the TTL', () => {
    let now = 0;
    const store = new GameStore({ ttlMs: 1000, now: () => now });
    const id = store.add(game());
    now = 900;
    expect(store.get(id)).toBeDefined(); // refreshes lastUsed
    now = 1800;
    expect(store.get(id)).toBeDefined();
    now = 2801;
    expect(store.get(id)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});
