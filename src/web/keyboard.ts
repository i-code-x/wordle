import type { Feedback, GuessRecord } from '../core';

const ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
const RANK: Record<Feedback, number> = { gray: 0, yellow: 1, green: 2 };

export type KeyHandler = (key: string) => void;

/**
 * On-screen keyboard plus physical keyboard input. Keys are 'a'..'z', 'enter', 'backspace'.
 * `isBlocked` lets the page ignore typing while a dialog is open.
 */
export class Keyboard {
  private readonly keys = new Map<string, HTMLButtonElement>();
  private readonly shown = new Map<string, Feedback>();

  constructor(root: HTMLElement, onKey: KeyHandler, isBlocked: () => boolean) {
    for (const letters of ROWS) {
      const row = document.createElement('div');
      row.className = 'key-row';
      for (const ch of letters) {
        const key = ch === '+' ? 'enter' : ch === '-' ? 'backspace' : ch;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `key${key.length > 1 ? ' wide' : ''}`;
        button.textContent = key === 'enter' ? 'Enter' : key === 'backspace' ? '⌫' : key.toUpperCase();
        button.setAttribute('aria-label', key);
        button.addEventListener('click', () => {
          button.blur();
          onKey(key);
        });
        this.keys.set(key, button);
        row.append(button);
      }
      root.append(row);
    }

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isBlocked()) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      const key = event.key.toLowerCase();
      if (key === 'enter' || key === 'backspace' || /^[a-z]$/.test(key)) {
        event.preventDefault();
        this.flash(key);
        onKey(key);
      }
    });
  }

  /** Show a physical key press on the matching on-screen key. */
  private flash(key: string): void {
    const button = this.keys.get(key);
    if (!button) return;
    button.classList.remove('pressed');
    void button.offsetWidth;
    button.classList.add('pressed');
    window.setTimeout(() => button.classList.remove('pressed'), 150);
  }

  /** Colour each letter with the best feedback it has received (green > yellow > gray). */
  render(guesses: readonly GuessRecord[]): void {
    const best = new Map<string, Feedback>();
    for (const { word, feedback } of guesses) {
      [...word].forEach((letter, i) => {
        const f = feedback[i]!;
        const prev = best.get(letter);
        if (!prev || RANK[f] > RANK[prev]) best.set(letter, f);
      });
    }
    for (const [key, button] of this.keys) {
      const f = best.get(key);
      button.classList.remove('green', 'yellow', 'gray');
      if (f) button.classList.add(f);
      if (f && f !== this.shown.get(key)) {
        // Newly coloured key: give it a little pop.
        button.classList.remove('lit');
        void button.offsetWidth;
        button.classList.add('lit');
      }
      if (f) this.shown.set(key, f);
      else this.shown.delete(key);
    }
  }
}
