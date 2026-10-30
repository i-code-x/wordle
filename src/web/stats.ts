const STATS_KEY = 'wordle-lab:stats';
const MAX_GUESSES = 6;

export interface Stats {
  played: number;
  wins: number;
  streak: number;
  best: number;
  /** Wins by number of guesses: index 0 is "solved in 1". */
  distribution: number[];
  /** Recent game ids already counted, so a reload never counts a game twice. */
  recorded: string[];
}

const empty = (): Stats => ({
  played: 0,
  wins: 0,
  streak: 0,
  best: 0,
  distribution: Array<number>(MAX_GUESSES).fill(0),
  recorded: [],
});

/** Per-browser stats. Storage can be unavailable (private mode), so every access is guarded. */
export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty();
    const stats = { ...empty(), ...(JSON.parse(raw) as Partial<Stats>) };
    if (!Array.isArray(stats.distribution) || stats.distribution.length !== MAX_GUESSES) {
      stats.distribution = empty().distribution;
    }
    if (!Array.isArray(stats.recorded)) stats.recorded = [];
    return stats;
  } catch {
    return empty();
  }
}

/** Count a finished game once. `counted` is false if this game was already recorded. */
export function recordResult(gameId: string, won: boolean, guesses: number): { stats: Stats; counted: boolean } {
  const stats = loadStats();
  if (stats.recorded.includes(gameId)) return { stats, counted: false };

  stats.played++;
  if (won) {
    stats.wins++;
    stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
    if (guesses >= 1 && guesses <= MAX_GUESSES) stats.distribution[guesses - 1]!++;
  } else {
    stats.streak = 0;
  }
  stats.recorded = [...stats.recorded, gameId].slice(-50);
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Stats are a nicety; the game works without them.
  }
  return { stats, counted: true };
}
