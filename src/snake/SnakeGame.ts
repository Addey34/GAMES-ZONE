import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import {
  Direction,
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  setupSwipe,
} from '../shared/input.js';

/**
 * Configuration spécifique au jeu Snake.
 */
interface SnakeConfig extends GameConfig {
  /** Nombre de cases par côté. Une grille plus grande = jeu plus facile. */
  gridSize?: number;
  /** Intervalle initial entre deux déplacements, en ms. */
  baseSpeed?: number;
  /** Intervalle minimal (vitesse max) atteint en accélérant, en ms. */
  minSpeed?: number;
  /** Facteur appliqué à l'intervalle à chaque nourriture mangée (<1 = accélère). */
  speedFactor?: number;
}

/**
 * Coordonnées d'une case sur la grille (1-indexées).
 */
interface Position {
  x: number;
  y: number;
}

/**
 * Le serpent : sa file de segments, sa direction et sa logique de déplacement.
 *
 * Le corps « s'enroule » aux bords de la grille (traversée d'un mur =
 * réapparition du côté opposé).
 */
export class Snake {
  private body: Position[];
  private velocity: Position;
  private direction: Direction;
  private gridSize: number;

  /**
   * Crée un serpent d'un segment à une position aléatoire, orienté à droite.
   * @param gridSize Taille de la grille (nombre de cases par côté).
   */
  constructor(gridSize: number) {
    this.gridSize = gridSize;
    this.body = [
      {
        x: Math.floor(Math.random() * gridSize) + 1,
        y: Math.floor(Math.random() * gridSize) + 1,
      },
    ];
    this.velocity = { x: 0, y: 0 };
    this.direction = 'right';
  }

  /**
   * Avance le serpent d'une case. Allonge le corps si la nourriture est mangée,
   * sinon retire le dernier segment (longueur constante).
   * @returns `true` si la nourriture a été mangée à ce déplacement.
   */
  move(food: Position): boolean {
    const head = this.body[0];
    const newHead: Position = {
      x: this.wrapPosition(head.x + this.velocity.x),
      y: this.wrapPosition(head.y + this.velocity.y),
    };

    this.body.unshift(newHead);
    const hasEaten = this.checkFoodCollision(food);
    if (!hasEaten) {
      this.body.pop();
    }
    return hasEaten;
  }

  /**
   * Replie une coordonnée hors-grille sur le bord opposé (effet « wrap »).
   */
  private wrapPosition(pos: number): number {
    if (pos <= 0) return this.gridSize;
    if (pos > this.gridSize) return 1;
    return pos;
  }

  /**
   * Détecte une collision de la tête avec le corps. Les quatre premiers segments
   * (indices 0 à 3) sont ignorés : le demi-tour étant interdit, il faut au moins
   * une boucle de 2×2 cases (4 déplacements) pour que la tête rejoigne une case
   * du corps — le segment d'indice 4 est donc le premier pouvant coïncider.
   */
  checkCollision(): boolean {
    const head = this.body[0];
    for (let i = 4; i < this.body.length; i++) {
      const segment = this.body[i];
      if (head.x === segment.x && head.y === segment.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Indique si la tête est sur la case de la nourriture.
   */
  private checkFoodCollision(food: Position): boolean {
    const head = this.body[0];
    return head.x === food.x && head.y === food.y;
  }

  /**
   * Change la direction du serpent. Le demi-tour est ignoré : le serpent ne peut
   * pas se retourner sur lui-même.
   */
  setDirection(newDirection: Direction): void {
    if (OPPOSITE_DIRECTION[newDirection] === this.direction) return;
    this.direction = newDirection;
    this.velocity = { ...DIRECTION_DELTAS[newDirection] };
  }

  /** Renvoie les segments du corps (tête en tête de liste). */
  getBody(): Position[] {
    return this.body;
  }

  /** Renvoie la direction courante. */
  getDirection(): Direction {
    return this.direction;
  }
}

/**
 * La nourriture : une case ne chevauchant jamais le serpent.
 */
export class Food {
  /** Modèles de souris disponibles (correspondent aux classes CSS .food--*). */
  private static readonly VARIANTS = ['gray', 'brown', 'white'] as const;

  private position: Position;
  private snake: Snake;
  private gridSize: number;
  /** Modèle de souris courant, retiré au hasard à chaque réapparition. */
  private variant: string = Food.VARIANTS[0];

  /**
   * @param snake Serpent à éviter lors du placement.
   * @param gridSize Taille de la grille.
   */
  constructor(snake: Snake, gridSize: number) {
    this.snake = snake;
    this.gridSize = gridSize;
    this.position = { x: 0, y: 0 };
    this.randomize();
  }

  /**
   * Replace la nourriture sur une case aléatoire libre (hors du corps du serpent)
   * et tire un nouveau modèle de souris.
   */
  randomize(): void {
    do {
      this.position = {
        x: Math.floor(Math.random() * this.gridSize) + 1,
        y: Math.floor(Math.random() * this.gridSize) + 1,
      };
    } while (this.isOnSnake());

    this.variant = Food.VARIANTS[Math.floor(Math.random() * Food.VARIANTS.length)];
  }

  /**
   * Indique si la position courante chevauche un segment du serpent.
   */
  private isOnSnake(): boolean {
    return this.snake
      .getBody()
      .some((segment) => segment.x === this.position.x && segment.y === this.position.y);
  }

  /** Renvoie la position de la nourriture. */
  getPosition(): Position {
    return this.position;
  }

  /** Renvoie le modèle de souris courant (suffixe de classe CSS .food--*). */
  getVariant(): string {
    return this.variant;
  }
}

/**
 * Jeu Snake.
 *
 * Le serpent se déplace sur une grille carrée à cadence fixe (indépendante des
 * 60 fps de la boucle de rendu) ; chaque nourriture mangée rapporte des points
 * et accélère le jeu jusqu'à un plancher de vitesse.
 */
export class SnakeGame extends GameEngine {
  private snake: Snake;
  private food: Food;
  private gridSize: number;
  private playBoard: HTMLElement | null = null;
  /** Calque d'effets superposé au plateau (non vidé à chaque frame). */
  private fxLayer: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /** Points gagnés par souris mangée. */
  private static readonly FOOD_POINTS = 10;

  /** Intervalle de base entre deux déplacements (ms). */
  private readonly baseInterval: number;
  /** Intervalle minimal atteignable en accélérant (ms). */
  private readonly minInterval: number;
  /** Facteur de réduction de l'intervalle à chaque nourriture (<1 = accélère). */
  private readonly speedFactor: number;
  /** Intervalle de déplacement courant (ms). */
  private moveInterval: number;
  /** Temps accumulé depuis le dernier déplacement (ms). */
  private moveAccumulator: number = 0;

  /**
   * @param config Configuration du jeu (taille de grille, vitesses…).
   */
  constructor(config: SnakeConfig = {}) {
    super({ ...config, storageKey: 'snake-high-scores' });
    this.gridSize = config.gridSize || 25;
    this.baseInterval = config.baseSpeed || 200;
    this.minInterval = config.minSpeed || 75;
    this.speedFactor = config.speedFactor || 0.93;
    this.moveInterval = this.baseInterval;

    this.snake = new Snake(this.gridSize);
    this.food = new Food(this.snake, this.gridSize);
  }

  /**
   * Lie les éléments du DOM, dimensionne la grille CSS d'après la taille logique
   * du jeu, câble le clavier et effectue le premier rendu.
   */
  initialize(): void {
    this.playBoard = document.querySelector('.play-board');
    this.scoreElement = document.querySelector('.score');
    this.highScoreElement = document.querySelector('.high-score');

    if (this.playBoard) {
      this.playBoard.style.gridTemplate = `repeat(${this.gridSize}, 1fr) / repeat(${this.gridSize}, 1fr)`;
      this.fxLayer = document.createElement('div');
      this.fxLayer.className = 'snake-fx';
      this.playBoard.appendChild(this.fxLayer);

      // Contrôle tactile (mobile) : glisser sur le plateau oriente le serpent.
      setupSwipe(this.playBoard, {
        onSwipe: (direction) => {
          if (!this.state.isGameOver) this.snake.setDirection(direction);
        },
      });
    }

    this.setupEventListeners();
    this.updateScoreDisplay();
    this.renderScoreTable();
    this.render();
  }

  /**
   * Avance le serpent au rythme de `moveInterval` (et non à chaque frame) : gère
   * la prise de nourriture, l'accélération et la détection de collision.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;

    this.moveAccumulator += deltaTime;
    if (this.moveAccumulator < this.moveInterval) return;
    this.moveAccumulator = 0;

    const hasEaten = this.snake.move(this.food.getPosition());

    if (hasEaten) {
      this.addScore(SnakeGame.FOOD_POINTS);
      this.spawnScoreFloat(this.food.getPosition(), SnakeGame.FOOD_POINTS);
      this.food.randomize();
      this.increaseSpeed();
    }

    if (this.snake.checkCollision()) {
      this.gameOver();
    }
  }

  /**
   * Réduit l'intervalle de déplacement (difficulté progressive), sans descendre
   * sous `minInterval` pour rester jouable.
   */
  private increaseSpeed(): void {
    this.moveInterval = Math.max(this.minInterval, this.moveInterval * this.speedFactor);
  }

  /**
   * Reconstruit le plateau : segments du serpent (tête vs corps) puis la
   * nourriture, positionnés via la grille CSS.
   */
  render(): void {
    if (!this.playBoard) return;

    // On ne vide que le serpent et la souris : le calque d'effets (.snake-fx)
    // et ses animations en cours doivent survivre d'une frame à l'autre.
    this.playBoard.querySelectorAll('.snake-head, .snake-body, .food').forEach((el) => el.remove());

    this.snake.getBody().forEach((segment, index) => {
      const snakeElement = document.createElement('div');
      snakeElement.style.gridRowStart = segment.y.toString();
      snakeElement.style.gridColumnStart = segment.x.toString();
      snakeElement.className =
        index === 0 ? `snake-head ${this.snake.getDirection()}` : 'snake-body';
      this.playBoard!.appendChild(snakeElement);
    });

    const foodPosition = this.food.getPosition();
    const foodElement = document.createElement('div');
    foodElement.style.gridRowStart = foodPosition.y.toString();
    foodElement.style.gridColumnStart = foodPosition.x.toString();
    foodElement.className = `food food--${this.food.getVariant()}`;
    foodElement.innerHTML = `
      <div class="food-ear left"></div>
      <div class="food-ear right"></div>
      <div class="food-body"></div>
      <div class="food-eye left"></div>
      <div class="food-eye right"></div>
      <div class="food-nose"></div>
      <div class="food-tail"></div>
    `;
    this.playBoard!.appendChild(foodElement);
  }

  /**
   * Fait apparaître un « +N » flottant sur la case donnée, dans le calque
   * d'effets. L'élément se retire tout seul à la fin de son animation CSS.
   */
  private spawnScoreFloat(pos: Position, points: number): void {
    if (!this.fxLayer) return;

    const float = document.createElement('div');
    float.className = 'score-float';
    float.textContent = `+${points}`;
    // Centre de la case visée, en pourcentage du plateau.
    float.style.left = `${((pos.x - 0.5) / this.gridSize) * 100}%`;
    float.style.top = `${((pos.y - 0.5) / this.gridSize) * 100}%`;
    float.addEventListener('animationend', () => float.remove());

    this.fxLayer.appendChild(float);
  }

  /**
   * Traduit la touche en direction et oriente le serpent (les flèches/ZQSD ne
   * font pas défiler la page).
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver) return;

    const direction = keyboardDirection(event);
    if (direction) {
      event.preventDefault();
      this.snake.setDirection(direction);
    }
  }

  /**
   * Recrée le serpent et la nourriture et remet score, vitesse et état à zéro.
   */
  reset(): void {
    this.snake = new Snake(this.gridSize);
    this.food = new Food(this.snake, this.gridSize);
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.moveInterval = this.baseInterval;
    this.moveAccumulator = 0;
    if (this.fxLayer) this.fxLayer.innerHTML = '';
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
      this.highScoreElement.textContent = `High Score: ${this.scoreManager.getHighScore()}`;
    }
  }
}
