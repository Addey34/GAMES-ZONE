/**
 * Une entrée du classement d'un jeu.
 */
export interface ScoreEntry {
  /** Nom saisi par le joueur. */
  username: string;
  /** Score réalisé. */
  score: number;
  /** Date de réalisation du score (défaut : maintenant). */
  date?: Date;
  /** Données spécifiques au jeu (ex. vitesse de frappe pour Dactylographie). */
  additionalData?: Record<string, number>;
}

/**
 * Gère la persistance d'un classement (top-N) dans `localStorage`.
 *
 * Chaque jeu instancie son propre `ScoreManager` avec une clé de stockage
 * distincte. Les scores sont conservés triés par ordre décroissant et limités
 * aux `maxScores` meilleurs.
 */
export class ScoreManager {
  private storageKey: string;
  private maxScores: number;

  /**
   * @param storageKey Clé `localStorage` propre au jeu.
   * @param maxScores Nombre maximal d'entrées conservées au classement.
   */
  constructor(storageKey: string, maxScores: number = 10) {
    this.storageKey = storageKey;
    this.maxScores = maxScores;
  }

  /**
   * Ajoute une entrée au classement, le retrie par score décroissant et ne
   * conserve que les `maxScores` meilleurs avant de persister.
   */
  saveScore(entry: ScoreEntry): void {
    const scores = this.getScores();
    scores.push({
      ...entry,
      date: entry.date || new Date(),
    });

    scores.sort((a, b) => b.score - a.score);

    const topScores = scores.slice(0, this.maxScores);

    localStorage.setItem(this.storageKey, JSON.stringify(topScores));
  }

  /**
   * Lit le classement persisté. Renvoie un tableau vide si aucune donnée n'est
   * stockée ou si le contenu est illisible.
   */
  getScores(): ScoreEntry[] {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return [];

    try {
      const parsed: unknown = JSON.parse(stored);
      // Le contenu peut être un JSON valide mais pas un tableau (donnée corrompue
      // ou format obsolète) : on retombe alors sur un classement vide.
      if (!Array.isArray(parsed)) return [];
      return parsed.map((raw): ScoreEntry => {
        const entry = raw as ScoreEntry;
        return {
          ...entry,
          date: entry.date ? new Date(entry.date) : new Date(),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Renvoie le meilleur score enregistré (0 si le classement est vide).
   */
  getHighScore(): number {
    const scores = this.getScores();
    return scores.length > 0 ? scores[0].score : 0;
  }

  /**
   * Efface intégralement le classement persisté.
   */
  clearScores(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Indique si un score mérite d'entrer au classement : vrai tant que le
   * classement n'est pas plein, ou si le score dépasse la dernière entrée.
   */
  isHighScore(score: number): boolean {
    const scores = this.getScores();
    if (scores.length < this.maxScores) return true;
    return score > scores[scores.length - 1].score;
  }
}
