/**
 * Options d'affichage du modal de fin de partie.
 */
export interface ModalOptions {
  /** Titre affiché en tête du modal. */
  title: string;
  /** HTML injecté dans `.score-details` (prioritaire sur `showScore`). */
  content?: string;
  /** Affiche le champ de saisie du nom du joueur. */
  showUsernameInput?: boolean;
  /** Affiche un score brut « Score: N » si aucun `content` n'est fourni. */
  showScore?: boolean;
  /** Valeur du score affichée quand `showScore` est actif. */
  score?: number;
  /** Boutons d'action à câbler dans le modal (Sauvegarder, Recommencer…). */
  buttons?: ModalButton[];
}

/**
 * Description d'un bouton d'action du modal.
 */
export interface ModalButton {
  /** Libellé du bouton. */
  text: string;
  /** Applique le style principal (`btn--primary`) plutôt que secondaire. */
  primary?: boolean;
  /** Callback exécuté au clic. */
  onClick: () => void;
}

/**
 * Pilote le modal de fin de partie.
 *
 * Le manager se lie à des éléments DOM aux ids/classes fixes attendus dans le
 * HTML (`.modal-content`, `h2`, `.score-details`, `#usernameInput`,
 * `.button-group`). Le contenu (titre, détails, boutons) est injecté à
 * l'exécution via {@link show}.
 */
export class ModalManager {
  private modalElement: HTMLElement | null = null;
  private modalContentElement: HTMLElement | null = null;
  private usernameInputElement: HTMLInputElement | null = null;
  /** Écouteur clavier actif tant que le modal est affiché (Entrée/Échap/Tab). */
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  /** Élément qui avait le focus avant l'ouverture, restauré à la fermeture. */
  private previouslyFocused: HTMLElement | null = null;

  /**
   * @param modalId id de l'élément racine du modal dans le HTML.
   */
  constructor(modalId: string) {
    this.modalElement = document.getElementById(modalId);
    if (this.modalElement) {
      this.modalContentElement = this.modalElement.querySelector('.modal-content');
      this.usernameInputElement = document.getElementById('usernameInput') as HTMLInputElement;
      // Sémantique de fenêtre modale pour les lecteurs d'écran.
      this.modalElement.setAttribute('role', 'dialog');
      this.modalElement.setAttribute('aria-modal', 'true');
    }
  }

  /**
   * Remplit puis affiche le modal : titre, contenu (HTML riche ou score brut),
   * champ de nom optionnel et boutons d'action. Donne le focus au champ de nom
   * lorsqu'il est visible.
   */
  show(options: ModalOptions): void {
    if (!this.modalElement || !this.modalContentElement) return;

    const titleElement = this.modalContentElement.querySelector('h2');
    if (titleElement) {
      titleElement.textContent = options.title;
      // Lie le titre au dialogue pour les lecteurs d'écran (aria-labelledby).
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

    // Mémorise le focus courant pour le rendre à la fermeture, puis place le
    // focus dans le modal : le champ de nom s'il est visible, sinon le 1er bouton.
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    if (options.showUsernameInput) {
      this.usernameInputElement?.focus();
    } else {
      this.getFocusable()[0]?.focus();
    }

    this.bindKeyboard();
  }

  /**
   * Masque le modal, détache l'écouteur clavier et rend le focus à l'élément
   * qui l'avait avant l'ouverture.
   */
  hide(): void {
    if (!this.modalElement) return;
    this.modalElement.style.display = 'none';
    this.unbindKeyboard();
    this.previouslyFocused?.focus();
    this.previouslyFocused = null;
  }

  /**
   * Liste les éléments focusables du modal (champ de nom + boutons), dans
   * l'ordre du DOM. Sert au focus initial et au piège de tabulation.
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
   * Câble les raccourcis clavier le temps que le modal est ouvert :
   *  - Entrée → bouton principal (Sauvegarder) ;
   *  - Échap  → bouton secondaire (Recommencer), sinon simple fermeture ;
   *  - Tab    → reste piégé dans le modal (cycle sur les éléments focusables).
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

  /** Détache l'écouteur clavier du modal s'il est actif. */
  private unbindKeyboard(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  /**
   * Renvoie le nom saisi par le joueur, espaces superflus retirés (`''` si vide).
   */
  getUsername(): string {
    return this.usernameInputElement?.value.trim() || '';
  }

  /**
   * Indique si le modal est actuellement affiché.
   */
  isVisible(): boolean {
    return this.modalElement?.style.display === 'block';
  }

  /**
   * Remplace les boutons du modal par ceux fournis et câble leurs callbacks.
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
