const CONFIG = {
  GRID_SIZE: 20,
  BASE_SPEED: 200,
  MIN_SPEED: 50,
  SPEED_REDUCTION: 5,
};

class Snake {
  constructor() {
    this.body = [
      [
        Math.floor(Math.random() * CONFIG.GRID_SIZE) + 1,
        Math.floor(Math.random() * CONFIG.GRID_SIZE) + 1,
      ],
    ];
    this.velocity = { x: 0, y: 0 };
    this.direction = 'right';
  }

  move(food) {
    const [headX, headY] = this.body[0];
    const newHead = [
      this.wrapPosition(headX + this.velocity.x),
      this.wrapPosition(headY + this.velocity.y),
    ];

    this.body.unshift(newHead);
    const hasEaten = this.checkFoodCollision(food);
    if (!hasEaten) {
      this.body.pop();
    }
    return hasEaten;
  }

  wrapPosition(pos) {
    if (pos <= 0) return CONFIG.GRID_SIZE;
    if (pos > CONFIG.GRID_SIZE) return 1;
    return pos;
  }

  checkCollision() {
    const [headX, headY] = this.body[0];
    // Ne vérifier la collision qu'avec le corps (pas la tête ni le cou)
    for (let i = 4; i < this.body.length; i++) {
      const [segmentX, segmentY] = this.body[i];
      if (headX === segmentX && headY === segmentY) {
        return true;
      }
    }
    return false;
  }

  checkFoodCollision(food) {
    const [headX, headY] = this.body[0];
    return headX === food.x && headY === food.y;
  }
}

class Food {
  constructor(snake) {
    this.snake = snake;
    this.randomize();
  }

  randomize() {
    do {
      this.x = Math.floor(Math.random() * CONFIG.GRID_SIZE) + 1;
      this.y = Math.floor(Math.random() * CONFIG.GRID_SIZE) + 1;
    } while (this.isOnSnake());
  }

  isOnSnake() {
    return this.snake.body.some(([x, y]) => x === this.x && y === this.y);
  }
}

class SnakeGame {
  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.reset();
    this.lastMoveTime = Date.now();
    this.moveDelay = 50;
  }

  initializeElements() {
    this.playBoard = document.querySelector('.play-board');
    this.scoreElement = document.querySelector('.score');
    this.highScoreElement = document.querySelector('.high-score');
    this.fullscreenBtn = document.getElementById('fullscreenBtn');
    this.wrapper = document.querySelector('.wrapper');
  }

  reset() {
    this.snake = new Snake();
    this.food = new Food(this.snake);
    this.score = 0;
    this.gameOver = false;
    this.highScore = parseInt(localStorage.getItem('high-score')) || 0;
    this.updateScoreDisplay();
  }

  setupEventListeners() {
    document.addEventListener('keydown', this.handleKeyPress.bind(this));
    this.fullscreenBtn.addEventListener(
      'click',
      this.toggleFullscreen.bind(this)
    );
    document.addEventListener('fullscreenchange', () => {
      this.wrapper.classList.toggle(
        'fullscreen',
        document.fullscreenElement !== null
      );
    });
  }

  handleKeyPress(e) {
    const currentTime = Date.now();
    if (currentTime - this.lastMoveTime < this.moveDelay) {
      return;
    }

    const movements = {
      ArrowUp: { x: 0, y: -1, dir: 'up', opposite: 'down' },
      z: { x: 0, y: -1, dir: 'up', opposite: 'down' },
      Z: { x: 0, y: -1, dir: 'up', opposite: 'down' },
      ArrowDown: { x: 0, y: 1, dir: 'down', opposite: 'up' },
      s: { x: 0, y: 1, dir: 'down', opposite: 'up' },
      S: { x: 0, y: 1, dir: 'down', opposite: 'up' },
      ArrowLeft: { x: -1, y: 0, dir: 'left', opposite: 'right' },
      q: { x: -1, y: 0, dir: 'left', opposite: 'right' },
      Q: { x: -1, y: 0, dir: 'left', opposite: 'right' },
      ArrowRight: { x: 1, y: 0, dir: 'right', opposite: 'left' },
      d: { x: 1, y: 0, dir: 'right', opposite: 'left' },
      D: { x: 1, y: 0, dir: 'right', opposite: 'left' },
    };

    const movement = movements[e.key];
    if (!movement) return;

    // Vérifier si la nouvelle direction n'est pas opposée à la direction actuelle
    if (movement.opposite !== this.snake.direction) {
      this.snake.velocity = { x: movement.x, y: movement.y };
      this.snake.direction = movement.dir;
      this.lastMoveTime = currentTime;
    }
  }

  start() {
    this.gameInterval = setInterval(() => this.update(), this.getGameSpeed());
  }

  update() {
    if (this.gameOver) {
      this.handleGameOver();
      return;
    }

    const hasEaten = this.snake.move(this.food);
    if (hasEaten) {
      this.handleFoodCollection();
    }

    if (this.snake.checkCollision()) {
      this.gameOver = true;
      return;
    }

    this.render();
  }

  handleFoodCollection() {
    this.food.randomize();
    this.score++;
    this.highScore = Math.max(this.score, this.highScore);
    localStorage.setItem('high-score', this.highScore);
    this.updateScoreDisplay();
    this.updateGameSpeed();
  }

  render() {
    this.playBoard.innerHTML = '';
    this.renderSnake();
    this.renderFood();
  }

  renderSnake() {
    this.snake.body.forEach((segment, index) => {
      const element = document.createElement('div');
      element.className =
        index === 0 ? `snake-head ${this.snake.direction}` : 'snake-body';
      element.style.gridArea = `${segment[1]} / ${segment[0]}`;
      this.playBoard.appendChild(element);
    });
  }

  renderFood() {
    const foodElement = document.createElement('div');
    foodElement.className = 'food';
    foodElement.innerHTML = `
            <div class="food-body"></div>
            <div class="food-ear left"></div>
            <div class="food-ear right"></div>
            <div class="food-eye left"></div>
            <div class="food-eye right"></div>
            <div class="food-tail"></div>
        `;
    foodElement.style.gridArea = `${this.food.y} / ${this.food.x}`;
    this.playBoard.appendChild(foodElement);
  }

  getGameSpeed() {
    return Math.max(
      CONFIG.MIN_SPEED,
      CONFIG.BASE_SPEED - this.score * CONFIG.SPEED_REDUCTION
    );
  }

  updateGameSpeed() {
    clearInterval(this.gameInterval);
    this.gameInterval = setInterval(() => this.update(), this.getGameSpeed());
  }

  handleGameOver() {
    clearInterval(this.gameInterval);
    const modal = document.getElementById('scoreModal');
    const finalScore = document.getElementById('finalScore');

    // Mettre à jour le modal
    finalScore.innerHTML = `
      <div class="score-details">
        <div>Score: ${this.score}</div>
      </div>
    `;

    // Mettre à jour la table des scores
    const scores = JSON.parse(localStorage.getItem('snake-scores') || '[]');
    this.updateScoreTable(scores);

    // Afficher le modal en mode plein écran si nécessaire
    modal.style.display = 'flex';
    if (document.fullscreenElement) {
      modal.classList.add('fullscreen');
    } else {
      modal.classList.remove('fullscreen');
    }
  }

  updateScoreDisplay() {
    this.scoreElement.innerHTML = `Score: ${this.score}`;
    this.highScoreElement.innerHTML = `High Score: ${this.highScore}`;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.wrapper.requestFullscreen().catch((err) => console.error(err));
      this.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
      document.exitFullscreen();
      this.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
  }

  saveScore(username) {
    let scores = JSON.parse(localStorage.getItem('snake-scores') || '[]');
    scores.push({
      username,
      score: this.score,
      date: new Date().toISOString(),
    });

    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('snake-scores', JSON.stringify(scores));
    this.updateScoreTable(scores);
  }

  updateScoreTable(scores) {
    const tbody = document.querySelector('#scoreTable tbody');
    if (tbody) {
      tbody.innerHTML = scores
        .map(
          (entry) => `
                <tr>
                    <td>${entry.username}</td>
                    <td>${entry.score}</td>
                </tr>
            `
        )
        .join('');
    }
  }

  // Ajoutez une méthode pour charger les scores initiaux
  loadHighScores() {
    const scores = JSON.parse(localStorage.getItem('snake-scores') || '[]');
    this.updateScoreTable(scores);
  }
}

// Initialisation du jeu
document.addEventListener('DOMContentLoaded', () => {
  window.game = new SnakeGame();
  window.game.loadHighScores();
  window.game.start();

  // Setup du modal de score
  const saveScoreBtn = document.getElementById('saveScore');
  const restartBtn = document.getElementById('restartGame');
  const usernameInput = document.getElementById('usernameInput');

  saveScoreBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
      window.game.saveScore(username);
      location.reload();
    }
  });

  restartBtn.addEventListener('click', () => location.reload());
});
