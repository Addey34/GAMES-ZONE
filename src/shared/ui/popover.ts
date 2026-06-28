/**
 * Generic collapsible popover used by the game-shell action buttons (Niveaux,
 * Paramètres, Classement, Multijoueur). The panel is revealed **on hover** in
 * pure CSS (like the help panel, see `panels.css`); this module only adds the
 * **pin** behaviour so a panel can stay open after the cursor leaves: a click /
 * tap on the toggle pins it (`.is-open` — this is also how it opens on mobile,
 * where there is no hover), an outside click unpins it, and `aria-expanded`
 * stays in sync. The panel content lives in its own component.
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

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(!control.classList.contains('is-open'));
  });

  // A click inside the panel never closes it. Crucially this also survives a
  // content re-render that detaches the clicked node before the document handler
  // runs (e.g. the multiplayer "Créer" button replacing the panel): a detached
  // target would fail the `contains` check below and wrongly close the panel.
  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // A click anywhere outside the control unpins the panel.
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
