import type { Suggestion } from '../core';

const TOTAL_KEY = 'wordle-lab:total-answers';
const COUNT_MS = 700;

export interface HintElements {
  count: HTMLElement;
  delta: HTMLElement;
  fill: HTMLElement;
  caption: HTMLElement;
  list: HTMLElement;
  bot: HTMLElement;
}

/** The words-remaining meter and the solver's ranked suggestions. */
export class HintPanel {
  private shown: number | null = null;
  private total: number;
  private tween = 0;

  constructor(
    private readonly el: HintElements,
    private readonly onPick: (word: string) => void,
  ) {
    this.total = readTotal();
  }

  /** A fresh game: its starting count is the size of the answer list, used to scale the meter. */
  startRound(total: number): void {
    this.total = total;
    try {
      localStorage.setItem(TOTAL_KEY, String(total));
    } catch {
      // Only used to scale the meter after a reload.
    }
    this.clear();
  }

  setRemaining(value: number | null): void {
    if (value === this.shown) return;
    const previous = this.shown;
    this.shown = value;

    if (value === null) {
      this.el.count.textContent = '–';
      this.el.fill.style.setProperty('--p', '0');
      return;
    }
    const total = Math.max(this.total, value, 2);
    const progress = value <= 1 ? 1 : 1 - Math.log(value) / Math.log(total);
    this.el.fill.style.setProperty('--p', progress.toFixed(3));
    this.el.caption.textContent = caption(value, total);
    if (previous !== null && value < previous) this.flashDelta(previous - value);
    this.countTo(previous ?? value, value);
  }

  clear(): void {
    this.el.list.replaceChildren();
  }

  thinking(on: boolean): void {
    this.el.bot.classList.toggle('thinking', on);
    if (!on) return;
    this.el.list.replaceChildren(
      ...[0, 1, 2].map((i) => {
        const item = document.createElement('li');
        item.className = 'hint skeleton';
        item.style.setProperty('--i', String(i));
        return item;
      }),
    );
  }

  showMessage(text: string): void {
    const item = document.createElement('li');
    item.className = 'hint-message';
    item.textContent = text;
    this.el.list.replaceChildren(item);
  }

  show(suggestions: readonly Suggestion[]): void {
    if (suggestions.length === 0) {
      this.showMessage('No suggestions: no words match the feedback so far.');
      return;
    }
    // A guess can reveal at most log2(remaining) bits; bars are relative to that.
    const maxBits = Math.log2(Math.max(this.shown ?? 2, 2));
    this.el.list.replaceChildren(
      ...suggestions.map((s, i) => {
        const item = document.createElement('li');
        item.style.setProperty('--i', String(i));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `hint${i === 0 ? ' top' : ''}`;
        button.title = 'Click to play this word';
        button.innerHTML = `
          <span class="hint-rank"></span>
          <span class="hint-main">
            <span class="hint-word"></span>
            <span class="hint-why"></span>
          </span>
          <span class="hint-score"><strong></strong><small>bits</small></span>
          <span class="hint-bar"><span></span></span>`;
        button.querySelector('.hint-rank')!.textContent = String(i + 1);
        const word = button.querySelector('.hint-word')!;
        for (const letter of s.word) {
          const tile = document.createElement('span');
          tile.className = 'mini';
          tile.textContent = letter.toUpperCase();
          word.append(tile);
        }
        const chip = document.createElement('span');
        chip.className = `chip ${s.isCandidate ? 'win' : 'scout'}`;
        chip.textContent = s.isCandidate ? 'could win' : 'scout';
        word.append(chip);
        button.querySelector('.hint-why')!.textContent = explain(s);
        button.querySelector('.hint-score strong')!.textContent = s.entropy.toFixed(2);
        (button.querySelector('.hint-bar span') as HTMLElement).style.setProperty(
          '--w',
          String(maxBits > 0 ? Math.min(1, s.entropy / maxBits) : 1),
        );
        button.addEventListener('click', () => this.onPick(s.word));
        item.append(button);
        return item;
      }),
    );
  }

  private flashDelta(amount: number): void {
    const delta = this.el.delta;
    delta.textContent = `−${amount.toLocaleString()}`;
    delta.classList.remove('show');
    void delta.offsetWidth;
    delta.classList.add('show');
  }

  private countTo(from: number, to: number): void {
    cancelAnimationFrame(this.tween);
    const count = this.el.count;
    count.classList.remove('bump');
    void count.offsetWidth;
    count.classList.add('bump');
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      count.textContent = to.toLocaleString();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      count.textContent = Math.round(from + (to - from) * eased).toLocaleString();
      if (t < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }
}

export function explain(s: Suggestion): string {
  if (s.entropy === 0 && s.isCandidate) return 'Last word standing. Play it to win!';
  const leaves = `Leaves ~${s.expectedRemaining.toFixed(1)} word${s.expectedRemaining === 1 ? '' : 's'} on average`;
  return s.isCandidate ? `${leaves} · might be the answer` : `${leaves} · can't win, but splits the rest well`;
}

function caption(remaining: number, total: number): string {
  if (remaining === 0) return 'Nothing matches. That shouldn’t happen!';
  if (remaining === 1) return 'One word left. You’ve got this! 🎯';
  if (remaining >= total) return 'Fresh board. Every guess narrows it down.';
  if (remaining <= 10) return `So close! Just ${remaining} left. 🔥`;
  if (remaining <= 100) return `Getting warm… ${remaining} words to go.`;
  return `Down to ${remaining.toLocaleString()}. Keep squeezing.`;
}

function readTotal(): number {
  try {
    return Number(localStorage.getItem(TOTAL_KEY)) || 0;
  } catch {
    return 0;
  }
}
