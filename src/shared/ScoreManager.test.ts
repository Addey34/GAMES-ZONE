import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreManager } from './ScoreManager.js';

describe('ScoreManager', () => {
  const KEY = 'test-scores';

  beforeEach(() => {
    localStorage.clear();
  });

  it("renvoie un classement vide quand rien n'est stocké", () => {
    const manager = new ScoreManager(KEY);
    expect(manager.getScores()).toEqual([]);
    expect(manager.getHighScore()).toBe(0);
  });

  it('trie les scores par ordre décroissant', () => {
    const manager = new ScoreManager(KEY);
    manager.saveScore({ username: 'A', score: 10 });
    manager.saveScore({ username: 'B', score: 30 });
    manager.saveScore({ username: 'C', score: 20 });

    expect(manager.getScores().map((s) => s.score)).toEqual([30, 20, 10]);
    expect(manager.getHighScore()).toBe(30);
  });

  it('ne conserve que les maxScores meilleurs', () => {
    const manager = new ScoreManager(KEY, 3);
    [5, 50, 15, 40, 25].forEach((score, i) => manager.saveScore({ username: `J${i}`, score }));

    expect(manager.getScores().map((s) => s.score)).toEqual([50, 40, 25]);
  });

  it('utilise une clé de stockage distincte par jeu', () => {
    const snake = new ScoreManager('snake');
    const tetris = new ScoreManager('tetris');
    snake.saveScore({ username: 'A', score: 100 });

    expect(snake.getScores()).toHaveLength(1);
    expect(tetris.getScores()).toEqual([]);
  });

  describe('isHighScore', () => {
    it("est vrai tant que le classement n'est pas plein", () => {
      const manager = new ScoreManager(KEY, 2);
      manager.saveScore({ username: 'A', score: 10 });
      expect(manager.isHighScore(1)).toBe(true);
    });

    it('compare à la dernière entrée quand le classement est plein', () => {
      const manager = new ScoreManager(KEY, 2);
      manager.saveScore({ username: 'A', score: 10 });
      manager.saveScore({ username: 'B', score: 20 });

      expect(manager.isHighScore(15)).toBe(true); // bat le 10
      expect(manager.isHighScore(5)).toBe(false); // ne bat pas le 10
    });
  });

  it('renvoie un classement vide si le contenu stocké est illisible', () => {
    localStorage.setItem(KEY, 'pas-du-json{');
    const manager = new ScoreManager(KEY);
    expect(manager.getScores()).toEqual([]);
  });

  it('réhydrate les dates en objets Date', () => {
    const manager = new ScoreManager(KEY);
    manager.saveScore({
      username: 'A',
      score: 10,
      date: new Date('2025-01-01'),
    });
    expect(manager.getScores()[0].date).toBeInstanceOf(Date);
  });

  it('efface le classement', () => {
    const manager = new ScoreManager(KEY);
    manager.saveScore({ username: 'A', score: 10 });
    manager.clearScores();
    expect(manager.getScores()).toEqual([]);
  });
});
