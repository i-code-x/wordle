const openModals: HTMLElement[] = [];
const onCloseHandlers = new WeakMap<HTMLElement, () => void>();

/** Wire up an overlay: clicking the backdrop or any `[data-close]` button closes it. */
export function bindModal(overlay: HTMLElement): void {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal(overlay);
  });
  overlay.querySelectorAll<HTMLElement>('[data-close]').forEach((button) =>
    button.addEventListener('click', () => closeModal(overlay)),
  );
}

export function openModal(overlay: HTMLElement, focus?: HTMLElement | null, onClose?: () => void): void {
  if (!openModals.includes(overlay)) openModals.push(overlay);
  if (onClose) onCloseHandlers.set(overlay, onClose);
  overlay.hidden = false;
  requestAnimationFrame(() => (focus ?? overlay.querySelector<HTMLElement>('button'))?.focus());
}

export function closeModal(overlay: HTMLElement): void {
  const index = openModals.indexOf(overlay);
  if (index < 0) return;
  openModals.splice(index, 1);
  overlay.hidden = true;
  onCloseHandlers.get(overlay)?.();
  onCloseHandlers.delete(overlay);
}

export function isModalOpen(): boolean {
  return openModals.length > 0;
}

document.addEventListener('keydown', (event) => {
  const top = openModals.at(-1);
  if (event.key === 'Escape' && top) closeModal(top);
});
