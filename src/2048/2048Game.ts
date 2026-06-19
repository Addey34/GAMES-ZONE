import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import { Direction, keyboardDirection, setupSwipe } from '../shared/input.js';

/**
 * Configuration spécifique au jeu 2048.
 */
interface Game2048Config extends GameConfig {
  /** Nombre de cases par côté de la grille (défaut : 4). */
  gridSize?: number;
}

/**
 * Résultat du glissement d'une ligne vers la gauche.
 */
interface SlideResult {
  /** Ligne après compression et fusions. */
  row: number[];
  /** Points gagnés par les fusions de cette ligne. */
  gained: number;
  /** La ligne a-t-elle changé par rapport à l'originale. */
  changed: boolean;
}

/**
 * Jeu 2048.
 *
 * Sur une grille carrée, les flèches font glisser toutes les tuiles dans une
 * direction ; deux tuiles de même valeur qui se rencontrent fusionnent en leur
 * somme (une seule fusion par tuile et par coup) et créditent cette somme au
 * score. Après chaque coup valide, une nouvelle tuile (2 à 90 %, 4 à 10 %)
 * apparaît sur une case libre. La partie s'achève quand plus aucun coup n'est
 * possible.
 *
 * Comme la dactylographie, ce jeu est piloté par les événements et n'utilise pas
 * la boucle `requestAnimationFrame` du moteur : {@link start} se contente
 * d'activer l'état, et le rendu est déclenché après chaque coup.
 */
export class Game2048 extends GameEngine {
  private readonly gridSize: number;
  /** Grille de valeurs ; 0 = case vide, sinon une puissance de deux. */
  private board: number[][] = [];

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Configuration du jeu (taille de grille).
   */
  constructor(config: Game2048Config = {}) {
    super({ ...config, storageKey: '2048-high-scores' });
    this.gridSize = config.gridSize || 4;
  }

  /**
   * Lie les éléments du DOM, câble le clavier, initialise la grille avec deux
   * tuiles puis effectue le premier rendu.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.highScoreElement = document.querySelector('.high-score');

    this.setupEventListeners();

    // Contrôle tactile (mobile) : glisser sur la grille joue le coup.
    if (this.boardElement) {
      setupSwipe(this.boardElement, {
        onSwipe: (direction) => this.applyMove(direction),
      });
    }

    this.resetBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Active l'état de jeu sans lancer la boucle `requestAnimationFrame` : 2048 est
   * piloté par les événements clavier (voir {@link handleInput}).
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
   * Reconstruit l'affichage de la grille à partir de {@link board}. Chaque tuile
   * porte une classe `tile--<valeur>` (et un modificateur selon son nombre de
   * chiffres) pour son style.
   */
  render(): void {
    if (!this.boardElement) return;

    this.boardElement.innerHTML = '';

    this.board.forEach((row) => {
      row.forEach((value) => {
        const tile = document.createElement('div');
        tile.className = this.tileClass(value);
        tile.textContent = value > 0 ? value.toString() : '';
        this.boardElement!.appendChild(tile);
      });
    });
  }

  /**
   * Classe CSS d'une tuile selon sa valeur et son nombre de chiffres (les grands
   * nombres réduisent la taille de police).
   */
  private tileClass(value: number): string {
    if (value === 0) return 'tile';

    const digits = value.toString().length;
    const sizeModifier = digits >= 4 ? ' tile--4digits' : digits === 3 ? ' tile--3digits' : '';
    // Au-delà de 2048, palette unique (pas de couleur dédiée par valeur).
    const colorClass = value <= 2048 ? `tile--${value}` : 'tile--super';
    return `tile ${colorClass}${sizeModifier}`;
  }

  /**
   * Applique le coup correspondant à la touche pressée. Si la grille change, fait
   * apparaître une nouvelle tuile, met à jour l'affichage et vérifie la fin de
   * partie.
   */
  handleInput(event: KeyboardEvent): void {
    const direction = keyboardDirection(event);
    if (!direction) return;

    event.preventDefault();
    this.applyMove(direction);
  }

  /**
   * Joue un coup dans la direction donnée (clavier ou swipe). Si la grille
   * change, fait apparaître une tuile, rafraîchit l'affichage et vérifie la fin
   * de partie.
   */
  private applyMove(direction: Direction): void {
    if (this.state.isGameOver) return;

    if (this.move(direction)) {
      this.spawnTile();
      this.render();
      if (!this.canMove()) {
        this.gameOver();
      }
    }
  }

  /**
   * Fait glisser et fusionne toutes les tuiles dans la direction donnée, en
   * créditant le score des fusions.
   *
   * Toutes les directions se ramènent à un glissement vers la gauche par
   * rotation/réflexion de la grille, suivi de la transformation inverse.
   *
   * @returns `true` si la grille a changé (coup valide).
   */
  private move(direction: Direction): boolean {
    const rotated = this.toLeftOriented(this.board, direction);

    let changed = false;
    let gained = 0;
    const slid = rotated.map((row) => {
      const result = this.slideRow(row);
      if (result.changed) changed = true;
      gained += result.gained;
      return result.row;
    });

    if (changed) {
      this.board = this.fromLeftOriented(slid, direction);
      this.addScore(gained);
    }

    return changed;
  }

  /**
   * Oriente la grille pour qu'un glissement « vers la gauche » corresponde à la
   * direction demandée.
   */
  private toLeftOriented(board: number[][], direction: Direction): number[][] {
    switch (direction) {
      case 'left':
        return board.map((row) => [...row]);
      case 'right':
        return this.reverseRows(board);
      case 'up':
        return this.transpose(board);
      case 'down':
        return this.reverseRows(this.transpose(board));
    }
  }

  /**
   * Transformation inverse de {@link toLeftOriented} : ramène la grille glissée
   * dans son orientation d'origine.
   */
  private fromLeftOriented(board: number[][], direction: Direction): number[][] {
    switch (direction) {
      case 'left':
        return board;
      case 'right':
        return this.reverseRows(board);
      case 'up':
        return this.transpose(board);
      case 'down':
        return this.transpose(this.reverseRows(board));
    }
  }

  /**
   * Compresse une ligne vers la gauche puis fusionne les tuiles égales adjacentes
   * (une fusion par tuile), et complète à droite avec des cases vides.
   */
  private slideRow(row: number[]): SlideResult {
    const nonZero = row.filter((value) => value !== 0);
    const merged: number[] = [];
    let gained = 0;

    for (let i = 0; i < nonZero.length; i++) {
      if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
        const value = nonZero[i] * 2;
        merged.push(value);
        gained += value;
        i++;
      } else {
        merged.push(nonZero[i]);
      }
    }

    while (merged.length < row.length) merged.push(0);

    const changed = merged.some((value, index) => value !== row[index]);
    return { row: merged, gained, changed };
  }

  /**
   * Transpose la grille (échange lignes et colonnes).
   */
  private transpose(board: number[][]): number[][] {
    return board[0].map((_, col) => board.map((row) => row[col]));
  }

  /**
   * Renvoie une copie de la grille dont chaque ligne est inversée.
   */
  private reverseRows(board: number[][]): number[][] {
    return board.map((row) => [...row].reverse());
  }

  /**
   * Fait apparaître une tuile (2 à 90 %, 4 à 10 %) sur une case libre choisie au
   * hasard. Sans effet si la grille est pleine.
   */
  private spawnTile(): void {
    const empty: Array<{ x: number; y: number }> = [];
    this.board.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 0) empty.push({ x, y });
      });
    });

    if (empty.length === 0) return;

    const cell = empty[Math.floor(Math.random() * empty.length)];
    this.board[cell.y][cell.x] = Math.random() < 0.9 ? 2 : 4;
  }

  /**
   * Indique s'il reste un coup possible : une case libre, ou deux tuiles égales
   * adjacentes (horizontalement ou verticalement).
   */
  private canMove(): boolean {
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const value = this.board[y][x];
        if (value === 0) return true;
        if (x + 1 < this.gridSize && value === this.board[y][x + 1]) return true;
        if (y + 1 < this.gridSize && value === this.board[y + 1][x]) return true;
      }
    }
    return false;
  }

  /**
   * Crée une grille vide et y place les deux tuiles de départ.
   */
  private resetBoard(): void {
    this.board = Array.from({ length: this.gridSize }, () =>
      Array.from({ length: this.gridSize }, () => 0)
    );
    this.spawnTile();
    this.spawnTile();
  }

  /**
   * Réinitialise la grille, le score et l'état, puis effectue le rendu.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.resetBoard();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Affiche le score courant et le meilleur score dans l'en-tête du jeu.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }
}
