import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import {
  Direction,
  Vec2 as Position,
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  setupSwipe,
} from '../shared/input.js';

/**
 * Configuration spécifique au jeu Pac-Man.
 */
interface PacmanConfig extends GameConfig {
  /** Intervalle entre deux déplacements, en ms (plus petit = plus rapide). */
  gameSpeed?: number;
}

/**
 * Un fantôme : sa position de grille et sa direction de déplacement courante.
 */
interface Ghost extends Position {
  direction: Direction;
}

/**
 * Jeu Pac-Man.
 *
 * Pac-Man parcourt une carte close (les cases hors-grille comptent comme des
 * murs) en mangeant la nourriture ; trois fantômes se déplacent aléatoirement.
 * La partie est gagnée quand toute la nourriture est mangée, perdue au contact
 * d'un fantôme. Rien ne bouge tant que le joueur n'a pas appuyé une première
 * touche.
 */
export class PacmanGame extends GameEngine {
  /** Case de départ de Pac-Man (jamais comptée comme nourriture). */
  private static readonly PACMAN_START: Position = { x: 1, y: 1 };

  private wallMap: number[][];
  private totalFood: number;
  private pacman: Position;
  private ghosts: Ghost[];
  /** Direction réellement suivie par Pac-Man. */
  private currentDirection: Direction | null = null;
  /** Direction demandée par le joueur, appliquée dès qu'un passage s'ouvre. */
  private nextDirection: Direction | null = null;
  /** Le jeu ne démarre qu'au premier appui de touche. */
  private hasStarted: boolean = false;
  /** Mémorise si la dernière fin de partie est une victoire (titre du modal). */
  private pendingWin: boolean = false;
  private mapElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private gameSpeed: number;
  /** Temps accumulé depuis le dernier déplacement (ms). */
  private lastMoveTime: number = 0;

  /**
   * @param config Configuration du jeu (vitesse de déplacement).
   */
  constructor(config: PacmanConfig = {}) {
    super({ ...config, storageKey: 'pacman-high-scores' });
    this.gameSpeed = config.gameSpeed || 200;

    this.wallMap = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
      [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

    // Toute case libre porte une pastille, sauf la case de départ de Pac-Man
    // (jamais traversée, donc jamais mangeable) : on l'exclut du total à manger.
    this.totalFood = this.wallMap.flat().filter((c) => c === 0).length - 1;

    this.pacman = { ...PacmanGame.PACMAN_START };
    this.ghosts = this.createGhosts();
  }

  /**
   * Crée les trois fantômes à des positions fixes (les trois coins praticables
   * autres que celui de Pac-Man, en haut à gauche).
   */
  private createGhosts(): Ghost[] {
    return [
      { x: 19, y: 1, direction: 'down' },
      { x: 1, y: 15, direction: 'up' },
      { x: 19, y: 15, direction: 'up' },
    ];
  }

  /**
   * Lie les éléments du DOM, construit la carte, câble le clavier et effectue le
   * premier rendu.
   */
  initialize(): void {
    this.mapElement = document.getElementById('map');
    this.scoreElement = document.getElementById('score');

    this.setupEventListeners();

    // Contrôle tactile (mobile) : glisser sur la carte oriente Pac-Man.
    if (this.mapElement) {
      setupSwipe(this.mapElement, {
        onSwipe: (direction) => {
          if (this.state.isGameOver) return;
          this.nextDirection = direction;
          this.hasStarted = true;
        },
      });
    }

    this.createMap();
    this.render();
    this.updateScoreDisplay();
    this.renderScoreTable();
  }

  /**
   * Génère les cases de la carte (murs / nourriture) dans le DOM. La taille des
   * cases est gérée par la grille CSS responsive, pas en pixels fixes.
   */
  private createMap(): void {
    if (!this.mapElement) return;

    this.mapElement.innerHTML = '';

    this.wallMap.forEach((row, y) => {
      row.forEach((cell, x) => {
        const div = document.createElement('div');
        const isStart = x === PacmanGame.PACMAN_START.x && y === PacmanGame.PACMAN_START.y;
        // Mur, couloir vide (case de départ) ou couloir avec pastille.
        div.classList.add(cell === 1 ? 'wall' : isStart ? 'nofood' : 'food');
        div.dataset.x = x.toString();
        div.dataset.y = y.toString();
        this.mapElement!.appendChild(div);
      });
    });
  }

  /**
   * Renvoie la case voisine d'une position dans une direction donnée.
   */
  private nextCell(pos: Position, dir: Direction): Position {
    const delta = DIRECTION_DELTAS[dir];
    return { x: pos.x + delta.x, y: pos.y + delta.y };
  }

  /**
   * Indique si une case est praticable (hors-grille = mur ⇒ carte close).
   */
  private isWalkable(pos: Position): boolean {
    return this.wallMap[pos.y]?.[pos.x] === 0;
  }

  /**
   * Indique si un déplacement depuis `pos` dans la direction `dir` est possible.
   */
  private canMove(pos: Position, dir: Direction): boolean {
    return this.isWalkable(this.nextCell(pos, dir));
  }

  /**
   * Déplace Pac-Man et les fantômes au rythme de `gameSpeed`. Inerte tant que le
   * joueur n'a pas appuyé de touche.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;
    if (!this.hasStarted) return;

    this.lastMoveTime += deltaTime;
    if (this.lastMoveTime < this.gameSpeed) return;
    this.lastMoveTime = 0;

    this.movePacman();
    this.moveGhosts();
  }

  /**
   * Rend Pac-Man et les fantômes.
   */
  render(): void {
    this.renderPacman();
    this.renderGhosts();
  }

  /**
   * Déplace Pac-Man d'une case et mange la nourriture rencontrée.
   *
   * Virage différé : la direction demandée s'applique dès qu'elle est libre, donc
   * pointer vers un mur n'arrête pas Pac-Man, qui continue tout droit. Face à un
   * mur, il reste sur place mais conserve direction et demande, et repart dès
   * qu'un passage s'ouvre. La victoire est déclenchée une fois toute la
   * nourriture mangée.
   */
  private movePacman(): void {
    if (this.state.isGameOver) return;

    if (this.nextDirection && this.canMove(this.pacman, this.nextDirection)) {
      this.currentDirection = this.nextDirection;
    }

    if (!this.currentDirection) return;

    if (!this.canMove(this.pacman, this.currentDirection)) return;

    this.pacman = this.nextCell(this.pacman, this.currentDirection);

    const cell = document.querySelector(`[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"]`);
    if (cell && cell.classList.contains('food')) {
      cell.classList.remove('food');
      cell.classList.add('nofood');
      this.addScore(1);

      if (this.state.score >= this.totalFood) {
        this.endGame(true);
      }
    }
  }

  /**
   * Déplace chaque fantôme aléatoirement, en évitant le demi-tour sauf lorsqu'il
   * s'agit de la seule issue (déplacement plus naturel). Le contact avec Pac-Man
   * met fin à la partie (défaite).
   */
  private moveGhosts(): void {
    const directions: Direction[] = ['up', 'down', 'left', 'right'];

    this.ghosts.forEach((ghost) => {
      let valid = directions.filter((dir) => this.canMove(ghost, dir));

      const forward = valid.filter((dir) => dir !== OPPOSITE_DIRECTION[ghost.direction]);
      if (forward.length > 0) valid = forward;

      if (valid.length > 0) {
        ghost.direction = valid[Math.floor(Math.random() * valid.length)];
        const next = this.nextCell(ghost, ghost.direction);
        ghost.x = next.x;
        ghost.y = next.y;
      }

      if (ghost.x === this.pacman.x && ghost.y === this.pacman.y) {
        this.endGame(false);
      }
    });
  }

  /**
   * Positionne `.pacman` sur la case courante, avec une classe d'orientation
   * (`.pacman--<direction>`) qui tourne la bouche vers le déplacement.
   */
  private renderPacman(): void {
    document
      .querySelectorAll('.pacman')
      .forEach((el) =>
        el.classList.remove('pacman', 'pacman--up', 'pacman--down', 'pacman--left', 'pacman--right')
      );
    const pacmanCell = document.querySelector(
      `[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"]`
    );
    if (pacmanCell) {
      pacmanCell.classList.add('pacman', `pacman--${this.currentDirection ?? 'right'}`);
    }
  }

  /**
   * Positionne `.ghost` sur la case de chaque fantôme, avec une classe d'index
   * (`.ghost--0/1/2`) qui détermine sa couleur.
   */
  private renderGhosts(): void {
    document
      .querySelectorAll('.ghost')
      .forEach((el) => el.classList.remove('ghost', 'ghost--0', 'ghost--1', 'ghost--2'));
    this.ghosts.forEach((ghost, index) => {
      const ghostCell = document.querySelector(`[data-x="${ghost.x}"][data-y="${ghost.y}"]`);
      if (ghostCell) ghostCell.classList.add('ghost', `ghost--${index}`);
    });
  }

  /**
   * Mémorise la direction demandée (virage différé) et démarre le jeu au premier
   * appui de touche.
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver) return;

    const direction = keyboardDirection(event);
    if (direction) {
      event.preventDefault();
      this.nextDirection = direction;
      this.hasStarted = true;
    }
  }

  /**
   * Replace Pac-Man et les fantômes, réinitialise score, directions et état, puis
   * reconstruit la carte.
   */
  reset(): void {
    this.pacman = { ...PacmanGame.PACMAN_START };
    this.ghosts = this.createGhosts();
    this.currentDirection = null;
    this.nextDirection = null;
    this.hasStarted = false;
    this.pendingWin = false;
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lastMoveTime = 0;

    this.createMap();
    this.render();
    this.updateScoreDisplay();
  }

  /**
   * Mémorise l'issue (victoire/défaite) puis délègue au flux de fin partagé.
   */
  private endGame(isWin: boolean): void {
    this.pendingWin = isWin;
    this.gameOver();
  }

  /**
   * Titre du modal : « Vous avez gagné ! » en cas de victoire, sinon « Game Over ! ».
   */
  protected getGameOverTitle(): string {
    return this.pendingWin ? 'Vous avez gagné !' : 'Game Over !';
  }

  /**
   * Affiche le score courant dans l'en-tête du jeu.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = this.state.score.toString();
    }
  }
}
