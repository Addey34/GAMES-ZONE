import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import { ScoreEntry } from '../shared/ScoreManager.js';

/**
 * Configuration spécifique au jeu de dactylographie.
 */
interface DactylographieConfig extends GameConfig {
  /** Durée de la partie, en secondes. */
  timeLimit?: number;
}

/**
 * Mesures de vitesse de frappe.
 */
interface SpeedMetrics {
  /** Mots par minute. */
  wpm: number;
  /** Lettres par minute. */
  lpm: number;
}

/**
 * Entrée de classement enrichie des métriques de frappe.
 */
interface DactylographieScoreEntry extends ScoreEntry {
  /** Nombre total de lettres correctement tapées. */
  letters: number;
  /** Mots par minute. */
  wpm: number;
  /** Lettres par minute. */
  lpm: number;
}

/**
 * Jeu de dactylographie.
 *
 * Le joueur tape les mots affichés pendant un temps limité ; chaque mot correct
 * rapporte un point. À l'inverse des autres jeux, celui-ci n'utilise pas la
 * boucle `requestAnimationFrame` : `start()` est surchargé par un `setInterval`
 * d'une seconde (le chrono), et l'affichage est piloté par les événements de
 * frappe et de redimensionnement.
 */
export class DactylographieGame extends GameEngine {
  private words: string[] = [];
  private currentWordIndex: number = 0;
  private readonly timeLimit: number;
  private timeLeft: number;
  private letterCount: number = 0;
  private timer: number | null = null;

  private wordContainer: HTMLElement | null = null;
  private wordInput: HTMLInputElement | null = null;
  private scoreDisplay: HTMLElement | null = null;
  private chronoDisplay: HTMLElement | null = null;

  /** Nombre de mots suivants affichés en aperçu sous le mot courant. */
  private static readonly UPCOMING_COUNT = 3;

  /**
   * @param config Configuration du jeu (durée de la partie).
   */
  constructor(config: DactylographieConfig = {}) {
    super({ ...config, storageKey: 'dactylographie-scores' });
    this.timeLimit = config.timeLimit || 60;
    this.timeLeft = this.timeLimit;
  }

  /**
   * Lie les éléments du DOM, câble les écouteurs, charge la liste de mots puis
   * effectue le premier affichage (mots, classement, score, chrono).
   */
  async initialize(): Promise<void> {
    this.wordContainer = document.getElementById('wordContainer');
    this.wordInput = document.getElementById('wordInput') as HTMLInputElement;
    this.scoreDisplay = document.getElementById('score');
    this.chronoDisplay = document.getElementById('chrono');

    this.setupEventListeners();
    this.words = await this.loadWords();
    this.updateWords();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.updateChronoDisplay();
  }

  /**
   * Câble les écouteurs propres à ce jeu : frappe dans le champ de saisie
   * (Espace valide le mot, la première frappe démarre le chrono). Les boutons du
   * modal sont câblés par le `ModalManager` via {@link GameEngine.onGameOver}.
   */
  protected setupEventListeners(): void {
    if (this.wordInput) {
      this.wordInput.addEventListener('keydown', (event) => {
        if (event.key === ' ') {
          event.preventDefault();
          this.checkWord();
        }
      });

      this.wordInput.addEventListener('input', () => {
        if (!this.state.isRunning) {
          this.start();
        }
        this.handleInputChange();
      });
    }
  }

  /**
   * Charge la liste de mots depuis `/words.txt`, nettoyée et mélangée. En cas
   * d'erreur réseau, renvoie une liste de repli.
   */
  private async loadWords(): Promise<string[]> {
    try {
      const response = await fetch('/words.txt');
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
  }

  /**
   * Mélange un tableau en place (Fisher-Yates) et le renvoie.
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * No-op : ce jeu n'utilise pas la boucle `requestAnimationFrame` (affichage
   * piloté par les événements). Imposé par le contrat de {@link GameEngine}.
   */
  update(_deltaTime: number): void {}

  /**
   * No-op : voir {@link update}.
   */
  render(): void {}

  /**
   * No-op : les entrées sont gérées via les écouteurs de {@link setupEventListeners}.
   */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Colore le mot courant lettre par lettre selon la saisie : vert si la lettre
   * tapée est correcte, rouge sinon ; la prochaine lettre attendue est marquée
   * `.active` (curseur visuel). Les lettres non encore tapées restent neutres.
   */
  private handleInputChange(): void {
    if (!this.wordInput || !this.wordContainer) return;

    const currentWord = this.words[this.currentWordIndex] ?? '';
    const input = this.wordInput.value;
    const letters = this.wordContainer.querySelectorAll<HTMLElement>('.focus-letter');

    letters.forEach((letterEl, i) => {
      letterEl.classList.remove('correct', 'incorrect', 'active');
      if (i < input.length) {
        const ok = input[i].toLowerCase() === currentWord[i]?.toLowerCase();
        letterEl.classList.add(ok ? 'correct' : 'incorrect');
      } else if (i === input.length) {
        letterEl.classList.add('active');
      }
    });
  }

  /**
   * Valide le mot saisi : compte le point et les lettres s'il est exact, avance
   * au mot suivant, et termine la partie si la liste est épuisée.
   */
  private checkWord(): void {
    if (!this.wordInput) return;

    const currentWord = this.words[this.currentWordIndex];
    const inputValue = this.wordInput.value.trim();

    if (inputValue === '') return;

    if (inputValue.toLowerCase() === currentWord.toLowerCase()) {
      this.addScore(1);
      this.letterCount += currentWord.length;
    }

    this.currentWordIndex++;
    this.wordInput.value = '';

    if (this.currentWordIndex < this.words.length) {
      this.updateWords();
    } else {
      this.gameOver();
    }
  }

  /**
   * Réaffiche la zone de frappe en « mode focus » : le mot courant en grand (une
   * lettre par `<span>` pour la coloration en direct), suivi d'un aperçu des
   * prochains mots. Recolore aussitôt selon la saisie déjà présente.
   */
  private updateWords(): void {
    if (!this.wordContainer) return;

    this.wordContainer.innerHTML = '';

    const current = this.words[this.currentWordIndex] ?? '';
    const focusWord = document.createElement('div');
    focusWord.className = 'focus-word';
    for (const letter of current) {
      const letterEl = document.createElement('span');
      letterEl.className = 'focus-letter';
      letterEl.textContent = letter;
      focusWord.appendChild(letterEl);
    }
    this.wordContainer.appendChild(focusWord);

    const upcoming = document.createElement('div');
    upcoming.className = 'upcoming';
    const start = this.currentWordIndex + 1;
    const end = Math.min(this.words.length, start + DactylographieGame.UPCOMING_COUNT);
    for (let j = start; j < end; j++) {
      const span = document.createElement('span');
      span.className = 'upcoming-word';
      span.textContent = this.words[j];
      upcoming.appendChild(span);
    }
    this.wordContainer.appendChild(upcoming);

    this.handleInputChange();
  }

  /**
   * Calcule les vitesses de frappe (mots et lettres par minute) sur le temps
   * écoulé depuis le début de la partie.
   */
  private calculateSpeed(): SpeedMetrics {
    const minutes = (this.timeLimit - this.timeLeft) / 60;
    return {
      wpm: minutes > 0 ? Math.round(this.state.score / minutes) : 0,
      lpm: minutes > 0 ? Math.round(this.letterCount / minutes) : 0,
    };
  }

  /**
   * Démarre le chrono (décompte d'une seconde). Surcharge le `start()` du moteur
   * pour ne pas utiliser la boucle `requestAnimationFrame`. La partie se termine
   * à zéro seconde restante.
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;

    this.timer = window.setInterval(() => {
      this.timeLeft--;
      this.updateChronoDisplay();

      if (this.timeLeft === 0) {
        this.gameOver();
      }
    }, 1000);
  }

  /**
   * Arrête le chrono.
   */
  stop(): void {
    this.state.isRunning = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Réinitialise la partie : chrono, index de mot, score et état, et réactive le
   * champ de saisie.
   */
  reset(): void {
    this.stop();
    this.currentWordIndex = 0;
    this.timeLeft = this.timeLimit;
    this.letterCount = 0;
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;

    if (this.wordInput) {
      this.wordInput.disabled = false;
      this.wordInput.placeholder = 'Tapez le mot ici...';
      this.wordInput.style.opacity = '1';
      this.wordInput.style.cursor = 'text';
      this.wordInput.value = '';
    }

    this.updateWords();
    this.updateScoreDisplay();
    this.updateChronoDisplay();
  }

  /**
   * Arrête le chrono, désactive la saisie, puis délègue au flux de fin partagé
   * (modal Sauvegarder/Recommencer).
   */
  protected onGameOver(): void {
    this.stop();

    if (this.wordInput) {
      this.wordInput.disabled = true;
      this.wordInput.placeholder = 'Partie terminée !';
      this.wordInput.style.opacity = '0.7';
      this.wordInput.style.cursor = 'not-allowed';
    }

    super.onGameOver();
  }

  /**
   * Titre du modal de fin.
   */
  protected getGameOverTitle(): string {
    return 'Partie terminée !';
  }

  /**
   * Détails affichés dans le modal : mots corrects, lettres tapées et vitesses.
   */
  protected getGameOverContent(): string {
    const speed = this.calculateSpeed();
    return `
      <div>Mots corrects : ${this.state.score}</div>
      <div>Lettres tapées : ${this.letterCount}</div>
      <div>Vitesse : ${speed.wpm} mots/minute</div>
      <div>Vitesse : ${speed.lpm} lettres/minute</div>
    `;
  }

  /**
   * Construit l'entrée de classement enrichie des métriques de frappe.
   */
  protected buildScoreEntry(username: string): DactylographieScoreEntry {
    const speed = this.calculateSpeed();
    return {
      username,
      score: this.state.score,
      letters: this.letterCount,
      wpm: speed.wpm,
      lpm: speed.lpm,
      date: new Date(),
    };
  }

  /**
   * Redémarrage par simple `reset()` (sans relancer la boucle) : la partie
   * repart automatiquement à la prochaine frappe.
   */
  protected restartAfterGameOver(): void {
    this.reset();
  }

  /**
   * Ligne de classement enrichie d'une colonne « Vitesse » (mots/min et lettres/min).
   */
  protected scoreTableRow(entry: ScoreEntry): string {
    const e = entry as DactylographieScoreEntry;
    return `<td>${this.escapeHtml(e.username)}</td><td>${e.score}</td><td>${e.wpm} mpm / ${e.lpm} lpm</td>`;
  }

  /**
   * Affiche le score courant dans l'en-tête du jeu.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreDisplay) {
      this.scoreDisplay.textContent = `Score : ${this.state.score}`;
    }
  }

  /**
   * Affiche le temps restant et passe le chrono en rouge sous les 10 secondes.
   */
  private updateChronoDisplay(): void {
    if (this.chronoDisplay) {
      this.chronoDisplay.textContent = this.timeLeft.toString();
      this.chronoDisplay.classList.toggle('is-low', this.timeLeft <= 10);
    }
  }
}
