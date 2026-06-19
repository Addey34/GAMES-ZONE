import { GameEngine, GameConfig } from '../shared/GameEngine.js';

/**
 * Configuration spécifique au jeu Memory.
 */
interface MemoryConfig extends GameConfig {
  /** Nombre de cases par côté de la grille (doit donner un total pair ; défaut : 4). */
  gridSize?: number;
}

/**
 * État d'une carte de la grille.
 */
type CardState = 'hidden' | 'flipped' | 'matched';

/**
 * Une carte du plateau.
 */
interface Card {
  /** Classe Font Awesome du symbole (deux cartes partagent le même). */
  symbol: string;
  /** État courant de la carte. */
  state: CardState;
}

/**
 * Réserve de symboles (icônes Font Awesome). Doit compter au moins autant
 * d'entrées que de paires à former (8 pour une grille 4×4).
 */
const SYMBOLS = [
  'fa-apple-whole',
  'fa-star',
  'fa-heart',
  'fa-bolt',
  'fa-bell',
  'fa-anchor',
  'fa-bug',
  'fa-cat',
  'fa-crown',
  'fa-fish',
  'fa-ghost',
  'fa-leaf',
];

/**
 * Jeu Memory (jeu de paires).
 *
 * Sur une grille carrée de cartes face cachée, le joueur en retourne deux : si
 * elles portent le même symbole elles restent visibles (paire trouvée), sinon
 * elles se retournent après un court délai. La partie est gagnée quand toutes les
 * paires sont trouvées. Le score récompense l'efficacité (peu de coups) et la
 * rapidité, de sorte qu'un meilleur score = une meilleure partie.
 *
 * Comme 2048 et la dactylographie, ce jeu est piloté par les événements (clics
 * souris) et n'utilise pas la boucle `requestAnimationFrame` du moteur :
 * {@link start} se contente d'activer l'état et le rendu suit chaque action.
 */
export class MemoryGame extends GameEngine {
  private readonly gridSize: number;
  private readonly totalPairs: number;

  private cards: Card[] = [];
  /** Indices des cartes actuellement retournées en attente de comparaison. */
  private flippedIndices: number[] = [];
  /** Verrou pendant l'animation de retournement d'une paire ratée. */
  private locked = false;

  private moves = 0;
  private matchedPairs = 0;
  /** Horodatage du premier coup (null tant que la partie n'a pas commencé). */
  private startTime: number | null = null;
  private elapsedSeconds = 0;

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private movesElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Configuration du jeu (taille de grille).
   */
  constructor(config: MemoryConfig = {}) {
    super({ ...config, storageKey: 'memory-scores' });
    this.gridSize = config.gridSize || 4;
    this.totalPairs = (this.gridSize * this.gridSize) / 2;
  }

  /**
   * Lie les éléments du DOM, câble les clics, construit le plateau mélangé puis
   * effectue le premier rendu (cartes, classement, score).
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.movesElement = document.querySelector('.moves');
    this.highScoreElement = document.querySelector('.high-score');

    if (this.boardElement) {
      this.boardElement.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
    }

    this.setupEventListeners();
    this.buildBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Câble l'écouteur de clic (délégué sur le plateau) propre à ce jeu, en lieu et
   * place de l'écoute clavier par défaut du moteur.
   */
  protected setupEventListeners(): void {
    this.boardElement?.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.memory-card');
      if (card?.dataset.index !== undefined) {
        this.onCardClick(Number(card.dataset.index));
      }
    });
  }

  /**
   * Active l'état de jeu sans lancer la boucle `requestAnimationFrame` : Memory
   * est piloté par les clics (voir {@link onCardClick}).
   */
  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
  }

  /**
   * No-op : aucune logique continue à mettre à jour (jeu événementiel). Imposé
   * par le contrat de {@link GameEngine}.
   */
  update(_deltaTime: number): void {}

  /**
   * No-op : le jeu n'utilise pas le clavier. Imposé par le contrat de
   * {@link GameEngine} (l'entrée passe par {@link onCardClick}).
   */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Traite un clic sur la carte d'indice donné : retourne la carte, et dès qu'une
   * seconde carte est retournée, compare la paire (succès → cartes verrouillées,
   * échec → retournement après un court délai).
   */
  private onCardClick(index: number): void {
    if (this.locked || this.state.isGameOver) return;

    const card = this.cards[index];
    if (!card || card.state !== 'hidden') return;

    if (this.startTime === null) this.startTime = Date.now();

    card.state = 'flipped';
    this.flippedIndices.push(index);
    this.render();

    if (this.flippedIndices.length === 2) {
      this.moves++;
      this.updateScoreDisplay();
      this.checkPair();
    }
  }

  /**
   * Compare les deux cartes retournées : si elles correspondent, les marque
   * trouvées et crédite le score, sinon les remet face cachée après un délai.
   */
  private checkPair(): void {
    const [first, second] = this.flippedIndices;

    if (this.cards[first].symbol === this.cards[second].symbol) {
      this.cards[first].state = 'matched';
      this.cards[second].state = 'matched';
      this.flippedIndices = [];
      this.matchedPairs++;
      this.addScore(100);
      this.render();

      if (this.matchedPairs === this.totalPairs) {
        this.finishGame();
      }
      return;
    }

    this.locked = true;
    window.setTimeout(() => {
      this.cards[first].state = 'hidden';
      this.cards[second].state = 'hidden';
      this.flippedIndices = [];
      this.locked = false;
      this.render();
    }, 800);
  }

  /**
   * Termine la partie gagnée : ajoute le bonus d'efficacité (peu de coups) et de
   * rapidité, puis déclenche le flux de fin de partie.
   */
  private finishGame(): void {
    this.elapsedSeconds = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;

    const extraMoves = Math.max(0, this.moves - this.totalPairs);
    const efficiencyBonus = Math.max(0, 500 - extraMoves * 20);
    const timeBonus = Math.max(0, 300 - this.elapsedSeconds * 3);
    this.addScore(efficiencyBonus + timeBonus);

    this.gameOver();
  }

  /**
   * Reconstruit le plateau à partir d'un mélange de paires de symboles et crée
   * les éléments de carte (icône au dos révélée au retournement).
   */
  private buildBoard(): void {
    if (!this.boardElement) return;

    const symbols = SYMBOLS.slice(0, this.totalPairs);
    const deck = [...symbols, ...symbols];
    this.shuffle(deck);

    this.cards = deck.map((symbol) => ({ symbol, state: 'hidden' }));

    this.boardElement.innerHTML = this.cards
      .map(
        (card, index) => `
          <button class="memory-card" data-index="${index}" aria-label="Carte">
            <span class="memory-card-inner">
              <span class="memory-card-face memory-card-back">
                <i class="fas fa-question" aria-hidden="true"></i>
              </span>
              <span class="memory-card-face memory-card-front">
                <i class="fas ${card.symbol}" aria-hidden="true"></i>
              </span>
            </span>
          </button>`
      )
      .join('');
  }

  /**
   * Reflète l'état de chaque carte sur son élément DOM (classes `is-flipped` /
   * `is-matched`), sans reconstruire le plateau.
   */
  render(): void {
    if (!this.boardElement) return;

    const elements = this.boardElement.querySelectorAll<HTMLElement>('.memory-card');
    this.cards.forEach((card, index) => {
      const element = elements[index];
      if (!element) return;
      element.classList.toggle('is-flipped', card.state !== 'hidden');
      element.classList.toggle('is-matched', card.state === 'matched');
    });
  }

  /**
   * Mélange un tableau en place (Fisher–Yates).
   */
  private shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Réinitialise plateau, score et compteurs, puis effectue le rendu.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.flippedIndices = [];
    this.locked = false;
    this.moves = 0;
    this.matchedPairs = 0;
    this.startTime = null;
    this.elapsedSeconds = 0;
    this.buildBoard();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Affiche score courant, nombre de coups et meilleur score dans l'en-tête.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.movesElement) {
      this.movesElement.textContent = `Coups: ${this.moves}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }

  /**
   * Titre du modal : la partie se termine par une victoire (toutes les paires
   * trouvées).
   */
  protected getGameOverTitle(): string {
    return 'Bravo !';
  }

  /**
   * Récapitulatif riche affiché dans `.score-details` (coups, temps, score).
   */
  protected getGameOverContent(): string {
    return `
      <p>Toutes les paires trouvées !</p>
      <p>Coups : ${this.moves} — Temps : ${this.elapsedSeconds}s</p>
      <p>Score : ${this.state.score}</p>`;
  }
}
