import { randomUUID } from 'node:crypto';
import type { Game } from '../core';

export interface StoreOptions {
  maxGames?: number;
  ttlMs?: number;
  now?: () => number;
}

interface Entry {
  game: Game;
  lastUsed: number;
}

/**
 * In-memory games keyed by id. Bounded two ways: games idle longer than the TTL
 * expire, and past `maxGames` the least recently used game is evicted.
 * A Map keeps insertion order, so re-inserting on access keeps it in LRU order.
 */
export class GameStore {
  private readonly games = new Map<string, Entry>();
  private readonly maxGames: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: StoreOptions = {}) {
    this.maxGames = options.maxGames ?? 10_000;
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  add(game: Game): string {
    const id = randomUUID();
    this.games.set(id, { game, lastUsed: this.now() });
    while (this.games.size > this.maxGames) {
      const oldest = this.games.keys().next().value!;
      this.games.delete(oldest);
    }
    return id;
  }

  get(id: string): Game | undefined {
    const entry = this.games.get(id);
    if (!entry) return undefined;
    this.games.delete(id);
    if (this.now() - entry.lastUsed > this.ttlMs) return undefined;
    entry.lastUsed = this.now();
    this.games.set(id, entry);
    return entry.game;
  }

  get size(): number {
    return this.games.size;
  }
}
