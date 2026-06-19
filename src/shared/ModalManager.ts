/**
 * Display options for the game-over modal.
 */
export interface ModalOptions {
  /** Title shown at the top of the modal. */
  title: string;
  /** HTML injected into `.score-details` (takes precedence over `showScore`). */
  content?: string;
  /** Shows the player name input field. */
  showUsernameInput?: boolean;
  /** Shows a plain score "Score: N" if no `content` is provided. */
  showScore?: boolean;
  /** Score value shown when `showScore` is active. */
  score?: number;
  /** Action buttons to wire into the modal (Save, Restart…). */
  buttons?: ModalButton[];
}

/**
 * Description of a modal action button.
 */
export interface ModalButton {
  /** Button label. */
  text: string;
  /** Applies the primary style (`btn--primary`) rather than secondary. */
  primary?: boolean;
  /** Callback run on click. */
  onClick: () => void;
}

/**
 * Drives the game-over modal.
 *
 * The manager binds to DOM elements with fixed ids/classes expected in the
 * HTML (`.modal-content`, `h2`, `.score-details`, `#usernameInput`,
 * `.button-group`). The content (title, details, buttons) is injected at
 * runtime via {@link show}.
 */
export class ModalManager {
  private modalElement: HTMLElement | null = null;
  private modalContentElement: HTMLElement | null = null;
  private usernameInputElement: HTMLInputElement | null = null;
  /** Keyboard listener active while the modal is shown (Enter/Escape/Tab). */
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  /** Element that had focus before opening, restored on close. */
  private previouslyFocused: HTMLElement | null = null;

  /**
   * @param modalId id of the modal root element in the HTML.
   */
  constructor(modalId: string) {
    this.modalElement = document.getElementById(modalId);
    if (this.modalElement) {
      this.modalContentElement = this.modalElement.querySelector('.modal-content');
      this.usernameInputElement = document.getElementById('usernameInput') as HTMLInputElement;
      // Modal window semantics for screen readers.
      this.modalElement.setAttribute('role', 'dialog');
      this.modalElement.setAttribute('aria-modal', 'true');
    }
  }

  /**
   * Fills then shows the modal: title, content (rich HTML or plain score),
   * optional name field and action buttons. Focuses the name field when it is
   * visible.
   */
  show(options: ModalOptions): void {
    if (!this.modalElement || !this.modalContentElement) return;

    const titleElement = this.modalContentElement.querySelector('h2');
    if (titleElement) {
      titleElement.textContent = options.title;
      // Link the title to the dialog for screen readers (aria-labelledby).
      if (!titleElement.id) titleElement.id = 'modalTitle';
      this.modalElement.setAttribute('aria-labelledby', titleElement.id);
    }

    const scoreDetails = this.modalContentElement.querySelector('.score-details');
    if (scoreDetails) {
      if (options.content !== undefined) {
        scoreDetails.innerHTML = options.content;
      } else if (options.showScore && options.score !== undefined) {
        scoreDetails.textContent = `Score: ${options.score}`;
      }
    }

    if (this.usernameInputElement) {
      this.usernameInputElement.style.display = options.showUsernameInput ? 'block' : 'none';
      if (options.showUsernameInput) {
        this.usernameInputElement.value = '';
      }
    }

    if (options.buttons) {
      this.setupButtonHandlers(options.buttons);
    }

    this.modalElement.style.display = 'block';

    // Remember the current focus to restore it on close, then place the focus
    // inside the modal: the name field if visible, otherwise the 1st button.
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    if (options.showUsernameInput) {
      this.usernameInputElement?.focus();
    } else {
      this.getFocusable()[0]?.focus();
    }

    this.bindKeyboard();
  }

  /**
   * Hides the modal, detaches the keyboard listener and returns focus to the
   * element that had it before opening.
   */
  hide(): void {
    if (!this.modalElement) return;
    this.modalElement.style.display = 'none';
    this.unbindKeyboard();
    this.previouslyFocused?.focus();
    this.previouslyFocused = null;
  }

  /**
   * Lists the modal's focusable elements (name field + buttons), in DOM order.
   * Used for the initial focus and the tab trap.
   */
  private getFocusable(): HTMLElement[] {
    if (!this.modalContentElement) return [];
    return Array.from(
      this.modalContentElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  /**
   * Wires up keyboard shortcuts while the modal is open:
   *  - Enter  → primary button (Save);
   *  - Escape → secondary button (Restart), otherwise just close;
   *  - Tab    → stays trapped inside the modal (cycles over focusable elements).
   */
  private bindKeyboard(): void {
    if (!this.modalContentElement) return;
    this.unbindKeyboard();

    this.keydownHandler = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        const primary = this.modalContentElement?.querySelector<HTMLButtonElement>('.btn--primary');
        if (primary) {
          event.preventDefault();
          primary.click();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const secondary =
          this.modalContentElement?.querySelector<HTMLButtonElement>('.btn--secondary');
        if (secondary) secondary.click();
        else this.hide();
      } else if (event.key === 'Tab') {
        const focusable = this.getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', this.keydownHandler, true);
  }

  /** Detaches the modal's keyboard listener if it is active. */
  private unbindKeyboard(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  /**
   * Returns the name entered by the player, trimmed of extra spaces (`''` if empty).
   */
  getUsername(): string {
    return this.usernameInputElement?.value.trim() || '';
  }

  /**
   * Tells whether the modal is currently shown.
   */
  isVisible(): boolean {
    return this.modalElement?.style.display === 'block';
  }

  /**
   * Replaces the modal's buttons with the provided ones and wires their callbacks.
   */
  setupButtonHandlers(buttons: ModalButton[]): void {
    if (!this.modalContentElement) return;

    const buttonGroup = this.modalContentElement.querySelector('.button-group');
    if (!buttonGroup) return;

    buttonGroup.innerHTML = '';

    buttons.forEach((buttonConfig) => {
      const button = document.createElement('button');
      button.textContent = buttonConfig.text;
      button.className = buttonConfig.primary ? 'btn btn--primary' : 'btn btn--secondary';
      button.addEventListener('click', buttonConfig.onClick);
      buttonGroup.appendChild(button);
    });
  }
}
