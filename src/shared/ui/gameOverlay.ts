/**
 * Lightweight game-over overlay shown over the game shell (replaces the old
 * modal). It carries the title, the score (or rich content), an optional save
 * prompt, and action buttons (Rejouer / Voir le classement).
 *
 * For games with a leaderboard, the engine never auto-saves: the overlay shows a
 * save prompt with the player's name pre-filled and editable, so the player
 * chooses whether to record the score (and under which name).
 */

/** An action button rendered at the bottom of the overlay. */
export interface GameOverlayButton {
  text: string;
  /** Primary style + receives the initial focus (Enter triggers it). */
  primary?: boolean;
  onClick: () => void;
}

/** Save prompt, shown when the score is savable so the player decides whether to record it. */
export interface GameOverlayPrompt {
  label: string;
  placeholder: string;
  /** Pre-filled value (e.g. the stored pseudo), editable by the player. */
  value?: string;
  /** Submit button label (default: "OK"). */
  submitLabel?: string;
  /** Called with the entered (non-empty) value when the player validates. */
  onSubmit: (value: string) => void;
}

/** Everything needed to render the overlay. */
export interface GameOverlayOptions {
  title: string;
  /** Rich HTML body (trusted, built by the game). Falls back to a plain score. */
  bodyHtml?: string;
  /** Plain score shown when `bodyHtml` is omitted. */
  score?: number;
  prompt?: GameOverlayPrompt;
  buttons: GameOverlayButton[];
}

/**
 * Drives the game-over overlay, mounted into the game shell (`.game-shell`,
 * which is positioned) so it covers the play area without a full-screen modal.
 */
export class GameOverlay {
  private host: HTMLElement | null;
  private root: HTMLElement | null = null;

  /** @param host Element to overlay (defaults to the game shell). */
  constructor(host?: HTMLElement | null) {
    this.host = host ?? document.querySelector<HTMLElement>('.game-shell');
  }

  /** Builds and shows the overlay. Replaces any previous one. */
  show(options: GameOverlayOptions): void {
    if (!this.host) return;
    this.hide();

    const root = document.createElement('div');
    root.className = 'game-over';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Fin de partie');

    const card = document.createElement('div');
    card.className = 'game-over-card';

    const title = document.createElement('h2');
    title.className = 'game-over-title';
    title.textContent = options.title;
    card.appendChild(title);

    const body = document.createElement('div');
    body.className = 'game-over-body';
    if (options.bodyHtml !== undefined) {
      body.innerHTML = options.bodyHtml;
    } else if (options.score !== undefined) {
      body.textContent = `Score : ${options.score}`;
    }
    card.appendChild(body);

    if (options.prompt) {
      card.appendChild(this.buildPrompt(options.prompt));
    }

    const actions = document.createElement('div');
    actions.className = 'game-over-actions';
    let primaryButton: HTMLButtonElement | null = null;
    for (const config of options.buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = config.text;
      button.className = config.primary ? 'btn btn--primary' : 'btn btn--secondary';
      button.addEventListener('click', config.onClick);
      if (config.primary) primaryButton = button;
      actions.appendChild(button);
    }
    card.appendChild(actions);

    root.appendChild(card);
    this.host.appendChild(root);
    this.root = root;

    // Focus the pseudo field if present (and select its pre-filled value so the
    // player can edit it at once), otherwise the primary action (Enter restarts).
    const input = root.querySelector<HTMLInputElement>('.game-over-name input');
    if (input) {
      input.focus();
      input.select();
    } else {
      primaryButton?.focus();
    }
  }

  /** Removes the overlay if it is shown. */
  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  /** Builds the save prompt: a small inline form with an editable name field. */
  private buildPrompt(prompt: GameOverlayPrompt): HTMLElement {
    const form = document.createElement('form');
    form.className = 'game-over-name';

    const label = document.createElement('label');
    label.className = 'game-over-name-label';
    label.textContent = prompt.label;
    const inputId = 'gameOverName';
    label.htmlFor = inputId;
    form.appendChild(label);

    const row = document.createElement('div');
    row.className = 'game-over-name-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.className = 'input-field';
    input.placeholder = prompt.placeholder;
    input.maxLength = 20;
    input.value = prompt.value ?? '';
    row.appendChild(input);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn--primary';
    submit.textContent = prompt.submitLabel ?? 'OK';
    row.appendChild(submit);

    form.appendChild(row);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      prompt.onSubmit(value);
      // Replace the form with a small confirmation so it isn't asked again.
      const done = document.createElement('p');
      done.className = 'game-over-name-done';
      done.textContent = `Score enregistré au nom de ${value}.`;
      form.replaceWith(done);
    });

    return form;
  }
}
