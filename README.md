# 🎮 GamesZone

Une collection de jeux d'arcade jouables dans le navigateur, réunis dans une seule
application web. Aucun backend : les scores sont sauvegardés localement dans le navigateur pour l'instant
(`localStorage`).

## Jeux disponibles

- ⌨️ **Dactylographie** — entraînement à la frappe rapide
- 🐍 **Snake**
- 🟡 **Pacman**
- 🔢 **2048**
- 🧱 **Tetris**
- 🃏 **Memory**
- 🧱 **Casse-brique** (Breakout)

## Contrôles

Chaque jeu est jouable au **clavier** (flèches **ou** ZQSD/WASD) **et au tactile**
(glissé/swipe sur mobile). Une aide « ⓘ » (au survol) rappelle les contrôles de chaque
jeu, et un bouton **plein écran** est disponible.

## Stack technique

- [Vite](https://vitejs.dev/) — application multi-pages (une page par jeu)
- **TypeScript** (mode `strict`)
- [Handlebars](https://handlebarsjs.com/) — partials HTML partagés (en-tête, navigation, modale)
- CSS modulaire (design tokens, mobile-first), sans framework
- [Vitest](https://vitest.dev/) — tests unitaires ; **ESLint** + **Prettier** — qualité et format
- Intégration continue (GitHub Actions) : build + tests à chaque push / pull request

## Démarrage

Prérequis : [Node.js](https://nodejs.org/).

```bash
npm install      # installer les dépendances
npm run dev      # serveur de dev sur http://localhost:3000
```

## Scripts

| Commande             | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Serveur de développement (rechargement à chaud)          |
| `npm run build`      | Vérification des types puis build de prod → `dist/`      |
| `npm run preview`    | Sert le build de production en local                     |
| `npm run type-check` | Vérifie les types sans générer de build (`tsc --noEmit`) |
| `npm test`           | Lance les tests unitaires (Vitest)                       |
| `npm run lint`       | Analyse le code (ESLint) ; `lint:fix` corrige            |
| `npm run format`     | Formate le code (Prettier) ; `format:check` vérifie      |

## Structure du projet

```
src/
  index.html            # page d'accueil
  <jeu>/                # un dossier par jeu
    index.html          #   page du jeu (servie en URL propre /<jeu>)
    <jeu>-main.ts       #   point d'entrée
    <Jeu>.ts            #   logique du jeu
  shared/               # moteur de jeu et utilitaires partagés
  partials/             # partials HTML Handlebars (en-tête, navigation, modale)
public/
  css/                  # feuilles de style (servies à la racine)
  words.txt             # liste de mots pour la dactylographie
vite.config.ts          # config Vite + liste centrale des jeux
```

Tous les jeux partagent un moteur commun (`src/shared/GameEngine.ts`) qui gère la boucle de
jeu, le score et la modale de fin de partie.

### Ajouter un jeu

1. Ajouter une ligne dans le tableau `games` de `vite.config.ts`.
2. Créer `src/<jeu>/index.html`, `src/<jeu>/<jeu>-main.ts`, `src/<jeu>/<Jeu>.ts`
   et l'icône `public/icons/<jeu>.svg`.

Le jeu apparaît alors automatiquement dans la navigation et sur la page d'accueil.

## Contribuer

Les contributions sont les bienvenues ! Le projet fonctionne par **Pull Request**.
Consulte le guide [CONTRIBUTING.md](CONTRIBUTING.md) pour les étapes détaillées
(fork, branche, vérifications, ajout d'un jeu).
