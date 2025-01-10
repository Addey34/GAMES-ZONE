document.addEventListener('DOMContentLoaded', async function () {
  // Configuration du jeu
  const CONFIG = {
    timeLimit: 60,
    maxScores: 100000,
  };

  // État du jeu
  const gameState = {
    words: [],
    currentWordIndex: 0,
    score: 0,
    timer: null,
    timeLeft: CONFIG.timeLimit,
    letterCount: 0,
    isGameStarted: false,
  };

  // Éléments du DOM
  const elements = {
    wordContainer: document.getElementById('wordContainer'),
    wordInput: document.getElementById('wordInput'),
    scoreDisplay: document.getElementById('score'),
    chronoDisplay: document.getElementById('chrono'),
    modal: document.getElementById('scoreModal'),
    finalScore: document.getElementById('finalScore'),
    usernameInput: document.getElementById('usernameInput'),
    saveScoreBtn: document.getElementById('saveScore'),
    restartBtn: document.getElementById('restartGame'),
  };

  // Fonctions utilitaires
  const utils = {
    shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    },

    async loadWords() {
      try {
        const response = await fetch('words.txt');
        const text = await response.text();
        return this.shuffleArray(
          text
            .split('\n')
            .map((word) => word.trim())
            .filter((word) => word.length > 0)
        );
      } catch (error) {
        console.error('Erreur lors du chargement des mots:', error);
        return ['erreur', 'chargement', 'mots'];
      }
    },

    calculateSpeed() {
      const minutes = (CONFIG.timeLimit - gameState.timeLeft) / 60;
      return {
        wpm: Math.round(gameState.score / minutes),
        lpm: Math.round(gameState.letterCount / minutes),
      };
    },
  };

  // Gestionnaire d'affichage
  const display = {
    calculateWordsPerLine() {
      const container = elements.wordContainer;
      const containerWidth = container.clientWidth - 40;
      const wordExample = document.createElement('span');
      wordExample.className = 'word';
      wordExample.style.visibility = 'hidden';
      wordExample.textContent = 'exemple';
      document.body.appendChild(wordExample);
      
      const wordWidth = wordExample.offsetWidth + 12;
      document.body.removeChild(wordExample);
  
      return Math.floor(containerWidth / wordWidth);
    },
  
    updateWords() {
      const wordsPerLine = this.calculateWordsPerLine();
      elements.wordContainer.innerHTML = '';
      
      // Créer deux lignes
      const line1 = document.createElement('div');
      const line2 = document.createElement('div');
      line1.className = 'word-line';
      line2.className = 'word-line';
      
      const start = gameState.currentWordIndex;
      const totalWords = wordsPerLine * 2; // Nombre total de mots pour 2 lignes
      const end = Math.min(gameState.words.length, start + totalWords);
  
      for (let j = start; j < end; j++) {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = gameState.words[j];
        if (j === gameState.currentWordIndex) span.classList.add('current');
        
        // Ajouter à la première ou deuxième ligne selon l'index
        if (j < start + wordsPerLine) {
          line1.appendChild(span);
        } else {
          line2.appendChild(span);
        }
      }
  
      elements.wordContainer.appendChild(line1);
      elements.wordContainer.appendChild(line2);
    },

    updateScore() {
      elements.scoreDisplay.textContent = `Score : ${gameState.score}`;
    },

    disableInput() {
      elements.wordInput.disabled = true;
      elements.wordInput.placeholder = 'Partie terminée !';
      elements.wordInput.style.opacity = '0.7';
      elements.wordInput.style.cursor = 'not-allowed';
    },

    showModal() {
      const speed = utils.calculateSpeed();
      elements.finalScore.innerHTML = `
        <div class="score-details">
          <div>Mots corrects : ${gameState.score}</div>
          <div>Lettres tapées : ${gameState.letterCount}</div>
          <div>Vitesse : ${speed.wpm} mots/minute</div>
          <div>Vitesse : ${speed.lpm} lettres/minute</div>
        </div>
      `;
      elements.modal.style.display = 'flex';
      elements.usernameInput.focus();
    },
  };

  // Gestionnaire du jeu
  const gameManager = {
    async init() {
      gameState.words = await utils.loadWords();
      this.setupEventListeners();
      display.updateWords();
      this.loadHighScores();
    },

    setupEventListeners() {
      window.addEventListener('resize', () => display.updateWords());

      elements.wordInput.addEventListener('keydown', (event) => {
        if (event.key === ' ') {
          event.preventDefault();
          this.checkWord();
        }
      });

      elements.wordInput.addEventListener('input', () => {
        if (!gameState.isGameStarted) {
          this.startGame();
        }
        this.handleInput();
      });

      this.setupModalListeners();
    },

    setupModalListeners() {
      const setupModalButton = (button, action) => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', action);
        return newButton;
      };

      elements.saveScoreBtn = setupModalButton(elements.saveScoreBtn, () => {
        const username = elements.usernameInput.value.trim();
        if (username) {
          this.saveScore(username);
          elements.modal.style.display = 'none';
          location.reload();
        }
      });

      elements.restartBtn = setupModalButton(elements.restartBtn, () => {
        location.reload();
      });
    },

    startGame() {
      gameState.isGameStarted = true;
      gameState.timer = setInterval(() => {
        gameState.timeLeft--;
        elements.chronoDisplay.textContent = gameState.timeLeft;
        if (gameState.timeLeft === 0) {
          this.endGame();
        }
      }, 1000);
    },

    checkWord() {
      const currentWord = gameState.words[gameState.currentWordIndex];
      const inputValue = elements.wordInput.value.trim();

      if (inputValue === '') return;

      if (inputValue.toLowerCase() === currentWord.toLowerCase()) {
        gameState.score++;
        gameState.letterCount += currentWord.length;
        display.updateScore();
      }

      gameState.currentWordIndex++;
      elements.wordInput.value = '';

      if (gameState.currentWordIndex < gameState.words.length) {
        display.updateWords();
      } else {
        this.endGame();
      }
    },

    handleInput() {
      const currentWord = gameState.words[gameState.currentWordIndex];
      const currentSpan = elements.wordContainer.querySelector('.current');
      const inputValue = elements.wordInput.value.trim();

      if (currentSpan) {
        const isCorrect =
          inputValue.toLowerCase() ===
          currentWord.toLowerCase().slice(0, inputValue.length);
        currentSpan.className = `word current ${
          isCorrect ? 'correct' : 'incorrect'
        }`;
      }
    },

    endGame() {
      clearInterval(gameState.timer);
      display.disableInput();
      display.showModal();
    },

    saveScore(username) {
      let scores = JSON.parse(localStorage.getItem('dactylographie-scores') || '[]'); // Changé de 'highScores' à 'dactylographie-scores'
      scores.push({
        username,
        score: gameState.score,
        letters: gameState.letterCount,
        ...utils.calculateSpeed(),
        date: new Date().toISOString(),
      });

      scores.sort((a, b) => b.score - a.score).slice(0, CONFIG.maxScores);
      localStorage.setItem('dactylographie-scores', JSON.stringify(scores)); // Changé ici aussi
      this.updateScoreTable(scores);
    },

    loadHighScores() {
      const scores = JSON.parse(localStorage.getItem('dactylographie-scores') || '[]'); // Et ici
      this.updateScoreTable(scores);
    },

    updateScoreTable(scores) {
      const tbody = document.querySelector('#scoreTable tbody');
      tbody.innerHTML = scores
        .map(
          (entry) => `
        <tr>
          <td>${entry.username}</td>
          <td>${entry.score}</td>
          <td>${entry.wpm} mpm / ${entry.lpm} lpm</td>
        </tr>
      `
        )
        .join('');
    },
  };

  // Initialisation du jeu
  await gameManager.init();
});
