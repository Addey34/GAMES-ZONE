import { setupPopover } from './popover.js';

/**
 * Generic "Paramètres" popover for the game-shell header.
 *
 * Data-driven and game-agnostic: a game passes a list of {@link SettingsField}
 * (each a labelled segmented control), and the panel renders them into the shell
 * markup (`#settingsControl` / `#settingsToggle` / `#settingsPanel`) and reports
 * picks back via `onChange`. Open/close is delegated to {@link setupPopover}, like
 * the Niveaux / Classement panels. Reusable by any future game that opts into
 * `settings: true` (see the games array in vite.config.ts).
 */

/** One selectable value of a field. */
export interface SettingsChoice {
  label: string;
  value: string;
}

/** A labelled segmented control (single choice among a few options). */
export interface SettingsField {
  /** Stable id (used for the option name + aria wiring). */
  id: string;
  label: string;
  choices: SettingsChoice[];
  /** Currently selected value. */
  value: string;
  /** Called with the newly picked value. */
  onChange: (value: string) => void;
}

/** Handle returned by {@link setupSettingsPanel}. */
export interface SettingsPanelHandle {
  /** Greys out and blocks the whole panel (e.g. while in a multiplayer session). */
  setDisabled(disabled: boolean): void;
}

/**
 * Wires the settings panel. Returns null when the shell markup is absent (a game
 * without `settings: true`), so callers can safely ignore the result.
 */
export function setupSettingsPanel(fields: SettingsField[]): SettingsPanelHandle | null {
  const pop = setupPopover({
    control: 'settingsControl',
    toggle: 'settingsToggle',
    panel: 'settingsPanel',
  });
  if (!pop) return null;
  const { panel } = pop;

  const title = document.createElement('p');
  title.className = 'game-pop-title';
  title.textContent = 'Paramètres';

  const fieldEls: HTMLElement[] = [title];
  for (const field of fields) {
    const wrap = document.createElement('div');
    wrap.className = 'game-setting';

    const label = document.createElement('span');
    label.className = 'game-setting-label';
    label.textContent = field.label;
    wrap.appendChild(label);

    const seg = document.createElement('div');
    seg.className = 'game-seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', field.label);

    let current = field.value;
    const mark = (): void => {
      seg.querySelectorAll<HTMLButtonElement>('.game-seg-option').forEach((btn) => {
        const active = btn.dataset.value === current;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    };

    for (const choice of field.choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'game-seg-option';
      btn.dataset.value = choice.value;
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        if (current === choice.value) return;
        current = choice.value;
        mark();
        field.onChange(choice.value);
      });
      seg.appendChild(btn);
    }
    mark();

    wrap.appendChild(seg);
    fieldEls.push(wrap);
  }

  panel.replaceChildren(...fieldEls);

  return {
    setDisabled(disabled: boolean): void {
      if (disabled) pop.close();
      panel.querySelectorAll<HTMLButtonElement>('.game-seg-option').forEach((btn) => {
        btn.disabled = disabled;
      });
    },
  };
}
