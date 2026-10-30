import type { Feedback, GuessRecord } from '../core';

const WORD_LENGTH = 5;

/** Keep in sync with the `.tile.reveal` and `.tile.win` animations in styles.css. */
const FLIP_MS = 500;
const FLIP_STAGGER_MS = 250;
const POP_STAGGER_MS = 45;
const BOUNCE_STAGGER_MS = 100;
export const REVEAL_MS = FLIP_STAGGER_MS * (WORD_LENGTH - 1) + FLIP_MS;

const FEEDBACK_LABEL: Record<Feedback, string> = {
  green: 'correct position',
  yellow: 'in the word, wrong position',
  gray: 'not in the word',
};

export class Board {
  private readonly rows: HTMLElement[] = [];
  /** Rows that flip when first shown. The class stays on, so re-renders don't restart the animation. */
  private readonly revealRows = new Set<number>();
  private shownGuesses = 0;
  private winRow = -1;
  /** What was typed at the last render, to pop only newly added letters. */
  private typed = { row: -1, length: 0 };

  constructor(
    private readonly root: HTMLElement,
    maxGuesses: number,
  ) {
    this.build(maxGuesses);
  }

  private build(maxGuesses: number): void {
    this.root.replaceChildren();
    this.rows.length = 0;
    for (let r = 0; r < maxGuesses; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        row.append(tile);
      }
      this.root.append(row);
      this.rows.push(row);
    }
  }

  /**
   * Draw scored guesses, then the in-progress word on the next row. Newly scored rows flip
   * tile by tile; returns how long until that finishes (0 if nothing new was scored).
   */
  render(guesses: readonly GuessRecord[], current: string, maxGuesses: number, active: boolean): number {
    if (this.rows.length !== maxGuesses) this.build(maxGuesses);
    if (guesses.length < this.shownGuesses) {
      // New game.
      this.revealRows.clear();
      this.winRow = -1;
    }
    for (let r = this.shownGuesses; r < guesses.length; r++) this.revealRows.add(r);
    const revealMs = guesses.length > this.shownGuesses ? REVEAL_MS : 0;
    this.shownGuesses = guesses.length;

    const typingRow = guesses.length;
    const popFrom = typingRow === this.typed.row && current.length > this.typed.length ? this.typed.length : -1;
    this.typed = { row: typingRow, length: current.length };

    this.rows.forEach((row, r) => {
      const guess = guesses[r];
      const isTyping = active && r === typingRow;
      const letters = guess ? guess.word : r === typingRow ? current : '';
      const reveal = guess !== undefined && this.revealRows.has(r);
      const win = r === this.winRow;
      row.classList.toggle('active', isTyping);
      row.setAttribute('aria-label', guess ? `Guess ${r + 1}: ${guess.word}` : `Row ${r + 1}`);

      [...row.children].forEach((node, c) => {
        const tile = node as HTMLElement;
        const letter = letters[c] ?? '';
        const feedback = guess?.feedback[c];
        const pop = isTyping && popFrom >= 0 && c >= popFrom && c < current.length;
        const classes = ['tile'];
        if (letter) classes.push('filled');
        if (feedback) classes.push(feedback);
        if (reveal) classes.push('reveal');
        if (win) classes.push('win');
        if (pop) classes.push('pop');
        if (isTyping && c === current.length) classes.push('cursor');

        tile.textContent = letter.toUpperCase();
        tile.className = classes.join(' ');
        tile.style.animationDelay = win
          ? `${c * BOUNCE_STAGGER_MS}ms`
          : reveal
            ? `${c * FLIP_STAGGER_MS}ms`
            : pop
              ? `${(c - popFrom) * POP_STAGGER_MS}ms`
              : '';
        tile.setAttribute(
          'aria-label',
          letter ? `${letter.toUpperCase()}${feedback ? `, ${FEEDBACK_LABEL[feedback]}` : ''}` : 'empty',
        );
      });
    });
    return revealMs;
  }

  /** Bounce the winning row, one tile after another. */
  celebrate(rowIndex: number): void {
    this.winRow = rowIndex;
    const row = this.rows[rowIndex];
    if (!row) return;
    [...row.children].forEach((node, c) => {
      const tile = node as HTMLElement;
      tile.classList.add('win');
      tile.style.animationDelay = `${c * BOUNCE_STAGGER_MS}ms`;
    });
  }

  shake(rowIndex: number): void {
    const row = this.rows[rowIndex];
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth; // restart the animation
    row.classList.add('shake');
  }
}
