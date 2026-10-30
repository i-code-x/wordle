import { api, RequestError, type GameResponse } from './api';
import { Board } from './board';
import { sprayGraffiti } from './graffiti';
import { HintPanel } from './hints';
import { Keyboard } from './keyboard';
import { bindModal, closeModal, isModalOpen, openModal } from './modal';
import { loadStats, recordResult, type Stats } from './stats';

const WORD_LENGTH = 5;
const GAME_ID_KEY = 'wordle-lab:game-id';
const HELP_SEEN_KEY = 'wordle-lab:seen-help';

/** Graffiti shout by number of guesses taken. */
const WIN_WORDS = ['UNREAL!', 'GENIUS!', 'SLICK!', 'NICE ONE!', 'SOLID!', 'CLUTCH!'];
const WIN_PAINT = ['#ff3d81', '#ff8a00', '#ffd60a', '#22d3ee'];
const LOSS_PAINT = ['#60a5fa', '#a78bfa', '#94a3b8'];
const SPLAT_PAINT = ['#ff3d81', '#ffd60a', '#22d3ee', '#8b5cf6', '#17b26a', '#ff8a00'];
const CELEBRATE_MS = 1000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let game: GameResponse | null = null;
let current = '';
let busy = false;
let hintsUsed = 0;
let stopGraffiti: (() => void) | undefined;

const board = new Board($('board'), 6);
const keyboard = new Keyboard($('keyboard'), handleKey, isModalOpen);
const hints = new HintPanel(
  {
    count: $('remaining-count'),
    delta: $('remaining-delta'),
    fill: $('meter-fill'),
    caption: $('meter-caption'),
    list: $('hint-list'),
    bot: $('bot'),
  },
  (word) => {
    if (!playable() || busy) return;
    current = word;
    render();
  },
);
const hintButton = $<HTMLButtonElement>('hint-button');
const newGameButton = $<HTMLButtonElement>('new-game');
const resultModal = $('result');
const helpModal = $('help');
const statsModal = $('stats-modal');

// ---------- rendering ----------

let keyboardTimer: number | undefined;

/** Redraw everything; returns how long until a newly scored row finishes flipping. */
function render(): number {
  const guesses = game?.guesses ?? [];
  const maxGuesses = game?.maxGuesses ?? 6;
  const revealMs = board.render(guesses, current, maxGuesses, playable() && !busy);

  // Colour the keyboard only once the tiles have flipped, so it doesn't give the result away early.
  if (revealMs > 0) {
    window.clearTimeout(keyboardTimer);
    keyboardTimer = window.setTimeout(() => {
      keyboardTimer = undefined;
      keyboard.render(game?.guesses ?? []);
    }, revealMs);
  } else if (keyboardTimer === undefined || guesses.length === 0) {
    window.clearTimeout(keyboardTimer);
    keyboardTimer = undefined;
    keyboard.render(guesses);
  }

  hints.setRemaining(game ? game.remaining : null);
  hintButton.disabled = busy || !playable();
  newGameButton.classList.toggle('nudge', game !== null && !playable());
  renderRound(guesses.length, maxGuesses);
  return revealMs;
}

function renderRound(used: number, maxGuesses: number): void {
  const text = !game
    ? 'Loading…'
    : game.status === 'won'
      ? `Solved in ${used}! 🎉`
      : game.status === 'lost'
        ? 'Out of guesses'
        : `Guess ${used + 1} of ${maxGuesses}`;
  $('round-text').textContent = text;
  // Compact counter for narrow screens, where the meter card sits below the keyboard.
  $('round-left').textContent = game && playable() ? `· ${game.remaining.toLocaleString()} left` : '';
  const pips = $('round-pips');
  if (pips.childElementCount !== maxGuesses) {
    pips.replaceChildren(...Array.from({ length: maxGuesses }, () => document.createElement('span')));
  }
  [...pips.children].forEach((pip, i) => {
    pip.className = i < used ? 'used' : i === used && playable() ? 'now' : '';
  });
}

function playable(): boolean {
  return game !== null && game.status === 'in_progress';
}

let toastTimer: number | undefined;
function toast(message: string, options: { sticky?: boolean; action?: { label: string; run: () => void } } = {}): void {
  const el = $('toast');
  el.replaceChildren(document.createTextNode(message));
  if (options.action) {
    const button = document.createElement('button');
    button.className = 'button small primary';
    button.textContent = options.action.label;
    button.addEventListener('click', () => {
      el.classList.remove('visible');
      options.action!.run();
    });
    el.append(button);
  }
  el.classList.remove('visible');
  void el.offsetWidth; // replay the entrance for back-to-back messages
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  if (!options.sticky) toastTimer = window.setTimeout(() => el.classList.remove('visible'), 2600);
}

function hideToast(): void {
  window.clearTimeout(toastTimer);
  $('toast').classList.remove('visible');
}

const ERROR_ICON: Record<string, string> = {
  NOT_IN_WORD_LIST: '🤔',
  INVALID_LENGTH: '✋',
  INVALID_CHARACTERS: '✋',
  NETWORK: '📡',
  GAME_OVER: '🏁',
};

/** Show a failed request without breaking the page; offer recovery when the game is gone. */
function reportError(err: unknown): void {
  const error = err instanceof RequestError ? err : new RequestError('UNKNOWN', 'Something went wrong.');
  if (error.code === 'GAME_NOT_FOUND') {
    toast(`👻 ${error.message}`, { sticky: true, action: { label: 'New game', run: startGame } });
  } else {
    toast(`${ERROR_ICON[error.code] ?? '⚠️'} ${error.message}`);
  }
  if (!(err instanceof RequestError)) console.error(err);
}

/** Run a request with input locked, so the user can't double-submit. */
async function withBusy<T>(work: () => Promise<T>): Promise<T | undefined> {
  if (busy) return undefined;
  busy = true;
  render();
  try {
    return await work();
  } catch (err) {
    reportError(err);
    return undefined;
  } finally {
    busy = false;
    render();
  }
}

// ---------- game flow ----------

/** Store the server's latest state and redraw, so new feedback colours and the counter show immediately. */
function setGame(next: GameResponse): void {
  const justFinished = game?.id === next.id && game.status === 'in_progress' && next.status !== 'in_progress';
  game = next;
  const revealMs = render();
  try {
    sessionStorage.setItem(GAME_ID_KEY, next.id);
  } catch {
    // Storage may be unavailable (private mode); reload recovery is a convenience only.
  }
  if (next.status === 'in_progress') return;

  const { stats, counted } = recordResult(next.id, next.status === 'won', next.guesses.length);
  const later = (ms: number, run: () => void) =>
    window.setTimeout(() => {
      if (game?.id === next.id) run();
    }, ms);

  later(revealMs, () => showStreak(stats, counted && next.status === 'won'));
  if (next.status === 'won') {
    later(revealMs, () => board.celebrate(next.guesses.length - 1));
    later(revealMs + (justFinished ? CELEBRATE_MS : 300), () => showResult(next, stats));
  } else {
    later(revealMs + 400, () => showResult(next, stats));
  }
}

async function startGame(): Promise<void> {
  closeModal(resultModal);
  await withBusy(async () => {
    const next = await api.newGame();
    hideToast();
    current = '';
    hintsUsed = 0;
    hints.startRound(next.remaining);
    setGame(next);
  });
}

async function restoreOrStart(): Promise<void> {
  let savedId: string | null = null;
  try {
    savedId = sessionStorage.getItem(GAME_ID_KEY);
  } catch {
    savedId = null;
  }
  if (savedId) {
    try {
      setGame(await api.getGame(savedId));
      return;
    } catch {
      // The saved game is gone (e.g. server restarted); fall through to a new one.
    }
  }
  await startGame();
}

async function submitGuess(): Promise<void> {
  if (!game || !playable()) return;
  if (current.length !== WORD_LENGTH) {
    toast(`✋ Need ${WORD_LENGTH} letters.`);
    board.shake(game.guesses.length);
    return;
  }
  const id = game.id;
  const word = current;
  const result = await withBusy(() => api.guess(id, word));
  if (result) {
    current = '';
    hints.clear();
    setGame(result);
  } else if (game) {
    board.shake(game.guesses.length);
  }
}

function handleKey(key: string): void {
  if (busy || !playable()) return;
  if (key === 'enter') {
    void submitGuess();
    return;
  }
  if (key === 'backspace') current = current.slice(0, -1);
  else if (current.length < WORD_LENGTH) current += key;
  render();
}

async function requestHint(): Promise<void> {
  if (!game || !playable()) return;
  const id = game.id;
  hints.thinking(true);
  const result = await withBusy(() => api.hint(id));
  hints.thinking(false);
  if (result) {
    hintsUsed++;
    if (game) game.remaining = result.remaining;
    hints.show(result.suggestions);
    render();
  } else {
    hints.clear();
  }
}

// ---------- end of game ----------

function showResult(finished: GameResponse, stats: Stats): void {
  const won = finished.status === 'won';
  const used = finished.guesses.length;
  const shout = won ? (WIN_WORDS[used - 1] ?? 'NICE!') : 'SO CLOSE';
  const answer = (finished.answer ?? '').toUpperCase();

  $('result-title').textContent = won ? `${shout} Solved in ${used}.` : `Out of guesses. The word was ${answer}.`;
  $('result-tag').textContent = won
    ? `got it in ${used} · ${hintsUsed ? `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}` : 'no hints 💪'}`
    : 'the word was…';
  renderAnswer($('result-answer'), answer, won);
  renderStats($('result-stats'), stats);
  renderDistribution($('result-dist'), stats, won ? used : null);

  stopGraffiti?.();
  openModal(resultModal, $('play-again'), () => {
    stopGraffiti?.();
    stopGraffiti = undefined;
  });
  if (won) spawnSplats($('splats'));
  else $('splats').replaceChildren();
  // Wait a frame so the canvas has its laid-out size.
  requestAnimationFrame(() => {
    stopGraffiti = sprayGraffiti($<HTMLCanvasElement>('graffiti'), shout, won ? WIN_PAINT : LOSS_PAINT, reducedMotion());
  });
}

function renderAnswer(container: HTMLElement, answer: string, won: boolean): void {
  container.setAttribute('aria-label', `The answer was ${answer}`);
  container.replaceChildren(
    ...[...answer].map((letter, i) => {
      const tile = document.createElement('span');
      tile.className = `tile small reveal ${won ? 'green' : 'yellow'}`;
      tile.style.animationDelay = `${300 + i * 120}ms`;
      tile.textContent = letter;
      return tile;
    }),
  );
}

function renderStats(container: HTMLElement, stats: Stats): void {
  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const items: [string, string][] = [
    [String(stats.played), 'Played'],
    [`${winRate}%`, 'Win rate'],
    [String(stats.streak), 'Streak'],
    [String(stats.best), 'Best'],
  ];
  container.replaceChildren(
    ...items.map(([value, label], i) => {
      const cell = document.createElement('div');
      cell.style.setProperty('--i', String(i));
      const strong = document.createElement('strong');
      strong.textContent = value;
      const span = document.createElement('span');
      span.textContent = label;
      cell.append(strong, span);
      return cell;
    }),
  );
}

function renderDistribution(container: HTMLElement, stats: Stats, highlight: number | null): void {
  const max = Math.max(1, ...stats.distribution);
  container.replaceChildren(
    ...stats.distribution.map((count, i) => {
      const row = document.createElement('div');
      row.className = `dist-row${highlight === i + 1 ? ' current' : ''}`;
      row.style.setProperty('--i', String(i));
      const label = document.createElement('span');
      label.className = 'dist-label';
      label.textContent = String(i + 1);
      const bar = document.createElement('span');
      bar.className = 'dist-bar';
      bar.style.setProperty('--w', String(Math.max(0.08, count / max)));
      bar.textContent = String(count);
      row.append(label, bar);
      return row;
    }),
  );
}

/** Paint splats bursting across the wall behind the graffiti. */
function spawnSplats(container: HTMLElement): void {
  container.replaceChildren(
    ...Array.from({ length: 16 }, (_, i) => {
      const splat = document.createElement('span');
      splat.className = 'splat';
      splat.style.cssText = [
        `left:${Math.random() * 100}%`,
        `top:${Math.random() * 100}%`,
        `--s:${24 + Math.random() * 70}px`,
        `--c:${SPLAT_PAINT[i % SPLAT_PAINT.length]}`,
        `--r:${Math.random() * 360}deg`,
        `--d:${150 + Math.random() * 900}ms`,
      ].join(';');
      return splat;
    }),
  );
}

function showStreak(stats: Stats, bumped: boolean): void {
  const chip = $('streak');
  $('streak-count').textContent = String(stats.streak);
  chip.classList.toggle('hot', stats.streak > 0);
  if (bumped) {
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
}

function shareText(finished: GameResponse): string {
  const score = finished.status === 'won' ? finished.guesses.length : 'X';
  const grid = finished.guesses
    .map((g) => g.feedback.map((f) => (f === 'green' ? '🟩' : f === 'yellow' ? '🟨' : '⬛')).join(''))
    .join('\n');
  const hintNote = hintsUsed ? ` · ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}` : '';
  return `Wordle Lab ${score}/${finished.maxGuesses}${hintNote}\n\n${grid}`;
}

async function share(): Promise<void> {
  if (!game) return;
  try {
    await navigator.clipboard.writeText(shareText(game));
    toast('📋 Copied! Paste it anywhere.');
  } catch {
    toast("⚠️ Couldn't copy. Your browser blocked the clipboard.");
  }
}

// ---------- wiring ----------

[resultModal, helpModal, statsModal].forEach(bindModal);

hintButton.addEventListener('click', () => void requestHint());
newGameButton.addEventListener('click', () => {
  newGameButton.blur();
  void startGame();
});
$('play-again').addEventListener('click', () => void startGame());
$('share-button').addEventListener('click', () => void share());
const openHelp = () => openModal(helpModal, helpModal.querySelector<HTMLElement>('.button.primary'));
$('help-button').addEventListener('click', openHelp);
$('stats-button').addEventListener('click', () => {
  const stats = loadStats();
  renderStats($('stats-numbers'), stats);
  renderDistribution($('stats-dist'), stats, null);
  openModal(statsModal, statsModal.querySelector<HTMLElement>('.button.primary'));
});

showStreak(loadStats(), false);
render();
void restoreOrStart();

try {
  if (!localStorage.getItem(HELP_SEEN_KEY)) {
    localStorage.setItem(HELP_SEEN_KEY, '1');
    openHelp();
  }
} catch {
  // No storage: skip the first-visit guide.
}
