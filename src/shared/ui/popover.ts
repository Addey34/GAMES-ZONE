/**
 * Generic collapsible popover used by the game-shell action buttons (Levels,
 * Settings, Leaderboard, Multiplayer). The panel is revealed **purely on hover /
 * focus** in CSS (`panels.css`), exactly like the help panel — so every action
 * button behaves identically and there is no click-to-pin to second-guess (the
 * source of the old "did my click open or close it?" confusion). On touch, where
 * there is no hover, tapping the toggle button focuses it and `:focus-within`
 * reveals the panel; tapping elsewhere blurs it and it closes.
 *
 * This module therefore adds no open/close interaction of its own; it only
 * exposes a **programmatic** `open()` / `close()` (toggling `.is-open`) for the
 * one flow that needs to keep a panel up while the cursor is away — the
 * multiplayer session lobby — plus an outside-click that dismisses such a pin.
 *
 * Markup convention (see `shell-open.hbs` and `panels.css`): a `.game-pop`
 * control wraps a `.game-pop-toggle` button and a `.game-pop-panel`; the pinned
 * state is the `.is-open` class on the control.
 */

/** A wired popover: its DOM nodes plus programmatic open/close. */
export interface Popover {
  control: HTMLElement;
  toggle: HTMLElement;
  panel: HTMLElement;
  open(): void;
  close(): void;
}

/** ids of the three popover nodes (control / toggle / panel). */
export interface PopoverIds {
  control: string;
  toggle: string;
  panel: string;
}

/**
 * Wires a popover from its element ids. Returns null when any node is absent (a
 * game that did not opt into this panel), so callers can ignore the result.
 */
export function setupPopover(ids: PopoverIds): Popover | null {
  const control = document.getElementById(ids.control);
  const toggle = document.getElementById(ids.toggle);
  const panel = document.getElementById(ids.panel);
  if (!control || !toggle || !panel) return null;

  const setOpen = (open: boolean): void => {
    control.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  // A click inside the panel never dismisses a programmatic pin. Crucially this
  // also survives a content re-render that detaches the clicked node before the
  // document handler runs (e.g. the multiplayer "Create" button replacing the
  // panel): a detached target would fail the `contains` check below and wrongly
  // close the panel.
  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // A click anywhere outside the control dismisses a programmatic pin.
  document.addEventListener('click', (event) => {
    if (!control.contains(event.target as Node)) setOpen(false);
  });

  return {
    control,
    toggle,
    panel,
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
