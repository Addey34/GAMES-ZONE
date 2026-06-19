import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import { keyboardDirection, setupSwipe } from '../shared/input.js';

/**
 * Configuration spécifique au jeu Tetris.
 */
interface TetrisConfig extends GameConfig {
  /** Nombre de colonnes du plateau (défaut : 10). */
  cols?: number;
  /** Nombre de lignes du plateau (défaut : 20). */
  rows?: number;
  /** Intervalle de chute initial, en ms. */
  baseDropInterval?: number;
  /** Intervalle de chute minimal (vitesse max), en ms. */
  minDropInterval?: number;
}

/** Identifiant d'une pièce, sert aussi de clé de couleur CSS. */
type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/**
 * Définition d'une pièce : sa matrice carrée (1 = case pleine) et son type.
 */
interface Tetromino {
  type: TetrominoType;
  matrix: number[][];
}

/**
 * Pièce en cours de chute : sa matrice (orientation courante), son type et la
 * position de son coin haut-gauche dans la grille.
 */
interface ActivePiece {
  type: TetrominoType;
  matrix: number[][];
  x: number;
  y: number;
}

/**
 * Les sept tetrominoes dans leur orientation de départ.
 */
const TETROMINOES: Tetromino[] = [
  {
    type: 'I',
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    type: 'O',
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  {
    type: 'T',
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'S',
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    type: 'Z',
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'J',
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'L',
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
];

/**
 * Points attribués selon le nombre de lignes effacées d'un coup (index = lignes),
 * multipliés par le niveau courant.
 */
const LINE_SCORES = [0, 40, 100, 300, 1200];

/** Décalages horizontaux tentés lors d'une rotation (« wall kicks » basiques). */
const ROTATION_KICKS = [0, -1, 1, -2, 2];

/**
 * Jeu Tetris.
 *
 * Des pièces tombent à cadence régulière dans une grille ; le joueur les déplace
 * et les fait pivoter pour compléter des lignes, qui s'effacent et rapportent des
 * points. La vitesse de chute augmente avec le niveau (tous les 10 lignes). La
 * partie s'achève lorsqu'une nouvelle pièce ne peut plus apparaître.
 *
 * Le jeu réutilise la boucle `requestAnimationFrame` du moteur : la chute est
 * cadencée par un accumulateur de temps (comme Snake), indépendamment des 60 fps
 * de rendu.
 */
export class TetrisGame extends GameEngine {
  private readonly cols: number;
  private readonly rows: number;

  /** Grille des cases figées ; `null` = vide, sinon le type de la pièce posée. */
  private grid: (TetrominoType | null)[][] = [];
  private current: ActivePiece | null = null;

  /** Cadence de chute (ms). */
  private readonly baseDropInterval: number;
  private readonly minDropInterval: number;
  private dropInterval: number;
  /** Temps accumulé depuis la dernière descente (ms). */
  private dropAccumulator: number = 0;

  private lines: number = 0;
  private level: number = 1;

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private linesElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Configuration du jeu (dimensions, cadence de chute).
   */
  constructor(config: TetrisConfig = {}) {
    super({ ...config, storageKey: 'tetris-high-scores' });
    this.cols = config.cols || 10;
    this.rows = config.rows || 20;
    this.baseDropInterval = config.baseDropInterval || 800;
    this.minDropInterval = config.minDropInterval || 120;
    this.dropInterval = this.baseDropInterval;
  }

  /**
   * Lie les éléments du DOM, câble le clavier, prépare une grille vide avec une
   * première pièce, puis effectue le premier rendu.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.linesElement = document.querySelector('.lines');
    this.highScoreElement = document.querySelector('.high-score');

    this.setupEventListeners();

    // Contrôle tactile (mobile) : glisser ←/→ déplace, ↓ accélère la descente,
    // ↑ ou tap fait pivoter la pièce.
    if (this.boardElement) {
      setupSwipe(this.boardElement, {
        onSwipe: (direction) => {
          if (this.state.isGameOver || !this.current) return;
          if (direction === 'left') this.moveHorizontal(-1);
          else if (direction === 'right') this.moveHorizontal(1);
          else if (direction === 'down') this.softDrop();
          else if (direction === 'up') this.rotate();
        },
        onTap: () => {
          if (this.state.isGameOver || !this.current) return;
          this.rotate();
        },
      });
    }

    this.resetBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Fait descendre la pièce d'une case au rythme de `dropInterval` (et non à
   * chaque frame). Quand elle ne peut plus descendre, la pièce est figée.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;

    this.dropAccumulator += deltaTime;
    if (this.dropAccumulator < this.dropInterval) return;
    this.dropAccumulator = 0;

    this.step();
  }

  /**
   * Fait descendre la pièce courante d'une case, ou la fige si elle a atteint le
   * fond ou une autre pièce.
   */
  private step(): void {
    if (!this.current) return;

    if (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
    } else {
      this.lockPiece();
    }
  }

  /**
   * Reconstruit l'affichage du plateau : cases figées et pièce courante fusionnées.
   */
  render(): void {
    if (!this.boardElement) return;

    const cells = this.composeBoard();
    this.boardElement.innerHTML = cells
      .map((row) =>
        row
          .map((type) =>
            type ? `<div class="cell cell--${type}"></div>` : '<div class="cell"></div>'
          )
          .join('')
      )
      .join('');
  }

  /**
   * Construit la grille à afficher : copie des cases figées sur laquelle on
   * estampe la pièce courante.
   */
  private composeBoard(): (TetrominoType | null)[][] {
    const cells = this.grid.map((row) => [...row]);

    if (this.current) {
      const { matrix, x, y, type } = this.current;
      matrix.forEach((row, r) => {
        row.forEach((filled, c) => {
          if (!filled) return;
          const gx = x + c;
          const gy = y + r;
          if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
            cells[gy][gx] = type;
          }
        });
      });
    }

    return cells;
  }

  /**
   * Traduit la touche en action : déplacement latéral (gauche/droite), descente
   * douce (bas), rotation (haut) ou chute instantanée (espace).
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver || !this.current) return;

    const direction = keyboardDirection(event);

    if (direction === 'left') {
      event.preventDefault();
      this.moveHorizontal(-1);
    } else if (direction === 'right') {
      event.preventDefault();
      this.moveHorizontal(1);
    } else if (direction === 'down') {
      event.preventDefault();
      this.softDrop();
    } else if (direction === 'up') {
      event.preventDefault();
      this.rotate();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.hardDrop();
    }
  }

  /**
   * Décale la pièce d'une colonne si la position cible est libre.
   */
  private moveHorizontal(dx: number): void {
    if (!this.current) return;
    if (this.canPlace(this.current.matrix, this.current.x + dx, this.current.y)) {
      this.current.x += dx;
    }
  }

  /**
   * Descente douce : avance la pièce d'une case, crédite un point et réarme le
   * compteur de chute pour éviter un verrouillage immédiat.
   */
  private softDrop(): void {
    if (!this.current) return;
    if (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
      this.dropAccumulator = 0;
      this.addScore(1);
    }
  }

  /**
   * Chute instantanée : descend la pièce jusqu'au contact, crédite la distance
   * parcourue, puis la fige.
   */
  private hardDrop(): void {
    if (!this.current) return;

    let distance = 0;
    while (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
      distance++;
    }
    if (distance > 0) this.addScore(distance);

    this.dropAccumulator = 0;
    this.lockPiece();
  }

  /**
   * Pivote la pièce dans le sens horaire, en tentant quelques décalages latéraux
   * ({@link ROTATION_KICKS}) si l'orientation cible heurte un mur ou une pièce.
   */
  private rotate(): void {
    if (!this.current) return;

    const rotated = this.rotateMatrix(this.current.matrix);
    for (const offset of ROTATION_KICKS) {
      if (this.canPlace(rotated, this.current.x + offset, this.current.y)) {
        this.current.matrix = rotated;
        this.current.x += offset;
        return;
      }
    }
  }

  /**
   * Renvoie une copie de la matrice pivotée de 90° dans le sens horaire.
   */
  private rotateMatrix(matrix: number[][]): number[][] {
    const n = matrix.length;
    const rotated = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        rotated[j][n - 1 - i] = matrix[i][j];
      }
    }
    return rotated;
  }

  /**
   * Indique si une matrice peut occuper la position donnée : chaque case pleine
   * doit rester dans les colonnes/le bas de la grille et ne pas chevaucher une
   * case figée (le dépassement par le haut est toléré pour l'apparition).
   */
  private canPlace(matrix: number[][], posX: number, posY: number): boolean {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const gx = posX + c;
        const gy = posY + r;
        if (gx < 0 || gx >= this.cols || gy >= this.rows) return false;
        if (gy >= 0 && this.grid[gy][gx]) return false;
      }
    }
    return true;
  }

  /**
   * Fige la pièce courante dans la grille, efface les lignes complètes puis fait
   * apparaître la pièce suivante.
   */
  private lockPiece(): void {
    if (!this.current) return;

    const { matrix, x, y, type } = this.current;
    matrix.forEach((row, r) => {
      row.forEach((filled, c) => {
        if (!filled) return;
        const gy = y + r;
        const gx = x + c;
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.grid[gy][gx] = type;
        }
      });
    });

    const cleared = this.clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.addScore(LINE_SCORES[cleared] * this.level);
      this.updateLevel();
    }

    this.spawnPiece();
  }

  /**
   * Efface toutes les lignes pleines et fait descendre celles du dessus.
   * @returns Le nombre de lignes effacées.
   */
  private clearLines(): number {
    let cleared = 0;
    let y = this.rows - 1;

    while (y >= 0) {
      if (this.grid[y].every((cell) => cell !== null)) {
        this.grid.splice(y, 1);
        this.grid.unshift(new Array(this.cols).fill(null));
        cleared++;
      } else {
        y--;
      }
    }

    return cleared;
  }

  /**
   * Recalcule le niveau (un palier tous les 10 lignes) et accélère la chute en
   * conséquence, sans descendre sous `minDropInterval`.
   */
  private updateLevel(): void {
    this.level = Math.floor(this.lines / 10) + 1;
    this.dropInterval = Math.max(
      this.minDropInterval,
      this.baseDropInterval - (this.level - 1) * 65
    );
  }

  /**
   * Fait apparaître une nouvelle pièce aléatoire, centrée en haut. Si elle ne
   * peut pas être placée, la partie est terminée.
   */
  private spawnPiece(): void {
    const template = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
    const matrix = template.matrix.map((row) => [...row]);
    const x = Math.floor((this.cols - matrix[0].length) / 2);
    const y = 0;

    this.current = { type: template.type, matrix, x, y };

    if (!this.canPlace(matrix, x, y)) {
      this.gameOver();
    }
  }

  /**
   * Crée une grille vide et fait apparaître la première pièce.
   */
  private resetBoard(): void {
    this.grid = Array.from({ length: this.rows }, () =>
      new Array<TetrominoType | null>(this.cols).fill(null)
    );
    this.spawnPiece();
  }

  /**
   * Réinitialise grille, score, lignes, niveau, cadence et état, puis effectue le
   * rendu.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = this.baseDropInterval;
    this.dropAccumulator = 0;
    this.resetBoard();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Détails affichés dans le modal de fin : score et lignes effacées.
   */
  protected getGameOverContent(): string {
    return `<div>Score : ${this.state.score}</div><div>Lignes : ${this.lines}</div>`;
  }

  /**
   * Affiche score, lignes et meilleur score dans l'en-tête du jeu.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.linesElement) {
      this.linesElement.textContent = `Lignes: ${this.lines}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }
}
