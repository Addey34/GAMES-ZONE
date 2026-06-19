import { ScoreManager, ScoreEntry } from './ScoreManager.js';
import { ModalManager } from './ModalManager.js';

/**
 * Configuration commune à tous les jeux, passée au constructeur du moteur.
 */
export interface GameConfig {
  /** Largeur logique du canvas (px). */
  canvasWidth?: number;
  /** Hauteur logique du canvas (px). */
  canvasHeight?: number;
  /** Cadence initiale de la boucle (ms). */
  initialSpeed?: number;
  /** Clé localStorage du classement de ce jeu. */
  storageKey?: string;
  /** Nombre d'entrées conservées au classement. */
  maxScores?: number;
  /** id de l'élément modal dans le HTML (défaut : 'scoreModal'). */
  modalId?: string;
}

/**
 * État runtime partagé par tous les jeux.
 */
export interface GameState {
  /** Score courant de la partie. */
  score: number;
  /** La boucle de jeu tourne. */
  isRunning: boolean;
  /** La partie est terminée. */
  isGameOver: boolean;
  /** La partie est en pause. */
  isPaused: boolean;
}

/**
 * Classe de base abstraite de tous les jeux.
 *
 * `GameEngine` possède la boucle `requestAnimationFrame`, le cycle de vie
 * (`start`/`stop`/`pause`/`gameOver`) et l'état partagé ({@link GameState}). Il
 * compose également les collaborateurs {@link ScoreManager} (classement) et
 * {@link ModalManager} (modal de fin), et porte tout le flux de fin de partie
 * (modal Sauvegarder/Recommencer, sauvegarde du score, tableau des scores).
 *
 * Une sous-classe doit implémenter {@link initialize}, {@link update},
 * {@link render}, {@link handleInput} et {@link reset}, et ne surcharge que les
 * petits hooks `protected` (`getGameOverTitle`, `getGameOverContent`,
 * `buildScoreEntry`, `scoreTableRow`, `updateScoreDisplay`…) là où son
 * comportement diffère.
 *
 * Contrat de cycle de vie : `initialize()` ne s'exécute **qu'une fois**
 * (liaison du DOM, écouteurs, premier rendu) ; `start()` (re)lance uniquement la
 * boucle sans ré-initialiser. Un redémarrage est donc `reset()` + `start()`,
 * jamais un second `initialize()` (sinon les écouteurs s'empilent).
 */
export abstract class GameEngine {
  protected config: GameConfig;
  protected state: GameState;
  protected animationFrameId: number | null = null;
  protected lastTime: number = 0;

  /**
   * Plafond du `deltaTime` passé à `update()` (ms). Quand l'onglet repasse en
   * arrière-plan, `requestAnimationFrame` est gelé : à la reprise, la première
   * frame afficherait un delta de plusieurs secondes, faisant « sauter » toute
   * simulation (balle qui traverse un mur, etc.). On borne donc le delta pour que
   * la reprise reparte d'un pas raisonnable. Les jeux peuvent encore le réduire.
   */
  protected static readonly MAX_FRAME_DELTA = 100;

  /** Classement persisté du jeu. */
  protected scoreManager: ScoreManager;
  /** Modal de fin de partie. */
  protected modalManager: ModalManager;

  /**
   * @param config Configuration du jeu (valeurs par défaut appliquées).
   */
  constructor(config: GameConfig = {}) {
    this.config = {
      canvasWidth: 800,
      canvasHeight: 600,
      initialSpeed: 1000,
      ...config,
    };
    this.state = {
      score: 0,
      isRunning: false,
      isGameOver: false,
      isPaused: false,
    };

    this.scoreManager = new ScoreManager(
      this.config.storageKey ?? 'scores',
      this.config.maxScores ?? 10
    );
    this.modalManager = new ModalManager(this.config.modalId ?? 'scoreModal');
  }

  /** Liaison du DOM, écouteurs et premier rendu. Exécuté une seule fois. */
  abstract initialize(): void;
  /**
   * Met à jour la logique du jeu.
   * @param deltaTime Temps écoulé depuis la frame précédente (ms).
   */
  abstract update(deltaTime: number): void;
  /** Dessine l'état courant dans le DOM. */
  abstract render(): void;
  /** Traite une entrée clavier. */
  abstract handleInput(event: KeyboardEvent): void;
  /** Remet le jeu à son état initial (sans relancer la boucle). */
  abstract reset(): void;

  /**
   * Câble l'entrée clavier par défaut (`keydown` → {@link handleInput}). À
   * appeler depuis `initialize()`. Les jeux écoutant autre chose que le clavier
   * (ex. la frappe de texte) surchargent cette méthode.
   */
  protected setupEventListeners(): void {
    document.addEventListener('keydown', (e) => {
      if (this.isFormFieldTarget(e.target)) return;
      this.handleInput(e);
    });
  }

  /**
   * Indique si l'événement vise un champ de saisie (input/textarea/zone éditable),
   * auquel cas le jeu ne doit pas intercepter la frappe — sinon les touches de
   * contrôle (flèches, lettres) sont volées au champ du nom du classement.
   */
  protected isFormFieldTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return (
      element instanceof HTMLElement &&
      (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
    );
  }

  /**
   * Démarre la boucle de jeu. Sans effet si elle tourne déjà. Ne ré-exécute pas
   * `initialize()` : un redémarrage passe par `reset()` puis `start()`.
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lastTime = performance.now();

    this.gameLoop();
  }

  /**
   * Arrête la boucle de jeu et annule la frame planifiée.
   */
  stop(): void {
    this.state.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Bascule l'état de pause. À la reprise, relance la boucle (celle-ci cesse de
   * se replanifier dès l'entrée en pause).
   */
  pause(): void {
    if (!this.state.isRunning) return;
    this.state.isPaused = !this.state.isPaused;

    if (!this.state.isPaused) {
      this.lastTime = performance.now();
      this.gameLoop();
    }
  }

  /**
   * Termine la partie : arrête la boucle et déclenche le flux de fin de partie
   * ({@link onGameOver}).
   */
  gameOver(): void {
    this.state.isGameOver = true;
    this.state.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onGameOver();
  }

  /**
   * Boucle principale : calcule le `deltaTime`, met à jour puis rend le jeu, et
   * se replanifie via `requestAnimationFrame` tant que le jeu tourne.
   */
  protected gameLoop(): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    const currentTime = performance.now();
    const deltaTime = Math.min(currentTime - this.lastTime, GameEngine.MAX_FRAME_DELTA);
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * Ajoute des points au score et déclenche la mise à jour de l'affichage.
   */
  protected addScore(points: number): void {
    this.state.score += points;
    this.onScoreChange(this.state.score);
  }

  /**
   * Hook appelé à chaque changement de score ; rafraîchit l'affichage par défaut.
   */
  protected onScoreChange(_newScore: number): void {
    this.updateScoreDisplay();
  }

  /**
   * Écrit le score dans le DOM du jeu. Hook à surcharger : sélecteurs et format
   * varient d'un jeu à l'autre.
   */
  protected updateScoreDisplay(): void {
    // Hook pour les sous-classes.
  }

  /**
   * Point d'entrée du flux de fin de partie ; affiche le modal par défaut.
   * Surcharger pour ajouter des effets de bord (ex. désactiver une saisie).
   */
  protected onGameOver(): void {
    this.showGameOverModal();
  }

  /**
   * Construit et affiche le modal de fin (titre, détails, champ de nom si le
   * score entre au classement, boutons Sauvegarder/Recommencer).
   */
  protected showGameOverModal(): void {
    const content = this.getGameOverContent();
    this.modalManager.show({
      title: this.getGameOverTitle(),
      content,
      showScore: content === undefined,
      score: this.state.score,
      showUsernameInput: this.scoreManager.isHighScore(this.state.score),
      buttons: [
        {
          text: 'Sauvegarder',
          primary: true,
          onClick: () => this.handleSaveScore(),
        },
        {
          text: 'Recommencer',
          primary: false,
          onClick: () => {
            this.modalManager.hide();
            this.restartAfterGameOver();
          },
        },
      ],
    });
  }

  /**
   * Sauvegarde le score si un nom est saisi et que le score entre au classement,
   * puis ferme le modal et relance une partie.
   */
  private handleSaveScore(): void {
    const username = this.modalManager.getUsername();
    if (username && this.scoreManager.isHighScore(this.state.score)) {
      this.scoreManager.saveScore(this.buildScoreEntry(username));
      this.onScoreSaved();
    }
    this.modalManager.hide();
    this.restartAfterGameOver();
  }

  /**
   * Titre du modal de fin. Surcharger pour le personnaliser (ex. « Vous avez
   * gagné ! »).
   */
  protected getGameOverTitle(): string {
    return 'Game Over !';
  }

  /**
   * HTML riche injecté dans `.score-details`. Renvoyer `undefined` (défaut) pour
   * afficher un simple « Score: N ».
   */
  protected getGameOverContent(): string | undefined {
    return undefined;
  }

  /**
   * Construit l'entrée écrite au classement. Surcharger pour y ajouter des
   * données propres au jeu (ex. vitesse de frappe).
   */
  protected buildScoreEntry(username: string): ScoreEntry {
    return { username, score: this.state.score, date: new Date() };
  }

  /**
   * Hook appelé après une sauvegarde réussie ; rafraîchit le classement affiché.
   */
  protected onScoreSaved(): void {
    this.renderScoreTable();
  }

  /** Corps du tableau des scores (`#scoreTable tbody`), résolu paresseusement. */
  protected scoreTableBody: HTMLElement | null = null;

  /**
   * Rend le classement dans `#scoreTable`. À appeler depuis `initialize()` pour
   * l'affichage initial ; re-rendu automatiquement après chaque sauvegarde.
   */
  protected renderScoreTable(): void {
    if (!this.scoreTableBody) {
      this.scoreTableBody = document.querySelector('#scoreTable tbody');
    }
    if (!this.scoreTableBody) return;

    this.scoreTableBody.innerHTML = this.scoreManager
      .getScores()
      .map((entry) => `<tr>${this.scoreTableRow(entry)}</tr>`)
      .join('');
  }

  /**
   * Renvoie les cellules `<td>` d'une ligne du classement. Surcharger pour
   * ajouter des colonnes (défaut : nom + score).
   */
  protected scoreTableRow(entry: ScoreEntry): string {
    return `<td>${this.escapeHtml(entry.username)}</td><td>${entry.score}</td>`;
  }

  /**
   * Échappe une valeur saisie par l'utilisateur avant injection HTML (anti-XSS).
   */
  protected escapeHtml(value: string): string {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /**
   * Comportement déclenché par « Recommencer ». Défaut : `reset()` + `start()`.
   * Surcharger pour un redémarrage différent (ex. relance sur la 1re frappe).
   */
  protected restartAfterGameOver(): void {
    this.reset();
    this.start();
  }

  /**
   * Renvoie l'état courant en lecture seule.
   */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * Renvoie la configuration en lecture seule.
   */
  getConfig(): Readonly<GameConfig> {
    return this.config;
  }
}
