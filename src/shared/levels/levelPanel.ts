import { LevelsConfig, LevelProgress, isLevelUnlocked } from './levels.js';
import { setupPopover } from '../ui/popover.js';

/**
 * The collapsible "Niveaux" panel shown in the game shell header.
 *
 * Builds a grid of level buttons (locked ones disabled) into the markup the
 * shell partial provides (`#levelControl` / `#levelToggle` / `#levelPanel`);
 * the open/close behaviour is delegated to {@link setupPopover}, and the picked
 * level is reported back. Returns a handle so the engine can refresh it after
 * progress unlocks new levels.
 */

/** Handle returned by {@link setupLevelPanel}. */
export interface LevelPanelHandle {
  /** Re-renders the grid with updated progress (e.g. newly unlocked levels). */
  refresh(progress: LevelProgress): void;
}

/** Inputs to build the panel. */
export interface LevelPanelOptions {
  config: LevelsConfig;
  /** Current progress (decides lock states). */
  progress: LevelProgress;
  /** Currently selected level number. */
  selected: number;
  /** Called when the player picks an unlocked level. */
  onSelect: (levelId: number) => void;
}

/**
 * Wires the level panel. Returns null when the shell markup is absent (a game
 * without levels), so callers can safely ignore the result.
 */
export function setupLevelPanel(opts: LevelPanelOptions): LevelPanelHandle | null {
  const pop = setupPopover({ control: 'levelControl', toggle: 'levelToggle', panel: 'levelPanel' });
  if (!pop) return null;
  const { toggle, panel } = pop;

  let progress = opts.progress;
  let selected = opts.selected;

  const updateLabel = (): void => {
    const current = toggle.querySelector('.game-pop-current');
    if (current) current.textContent = String(selected);
    toggle.setAttribute('aria-label', `Niveau ${selected} — choisir un niveau`);
  };

  const render = (): void => {
    const title = document.createElement('p');
    title.className = 'game-pop-title';
    title.textContent = 'Niveaux';

    const grid = document.createElement('div');
    grid.className = 'game-levels-grid';

    for (const level of opts.config.levels) {
      const unlocked = isLevelUnlocked(level, progress);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-level';
      button.classList.toggle('is-locked', !unlocked);
      button.classList.toggle('is-selected', level.id === selected);
      button.disabled = !unlocked;
      button.textContent = level.label ?? String(level.id);
      button.setAttribute('aria-label', `Niveau ${level.id}${unlocked ? '' : ' (verrouillé)'}`);

      if (unlocked) {
        button.addEventListener('click', () => {
          selected = level.id;
          updateLabel();
          render();
          pop.close();
          opts.onSelect(level.id);
        });
      }
      grid.appendChild(button);
    }

    panel.replaceChildren(title, grid);
  };

  updateLabel();
  render();

  return {
    refresh(next: LevelProgress): void {
      progress = next;
      render();
    },
  };
}
