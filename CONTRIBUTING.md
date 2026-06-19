# Contribuer à GamesZone

Merci de vouloir contribuer ! 🎮 Que ce soit pour corriger un bug, améliorer un jeu
ou en ajouter un nouveau, toute aide est la bienvenue.

## En bref

Le projet fonctionne par **Pull Request (PR)** : tu travailles sur ta propre copie,
puis tu proposes tes changements. Personne ne pousse directement sur `main` —
chaque modification passe par une PR validée par l'intégration continue (CI) avant
d'être fusionnée.

## Étapes pour contribuer

1. **Fork** le dépôt (bouton « Fork » en haut à droite sur GitHub) : tu obtiens ta
   propre copie.
2. **Clone** ta copie sur ton ordinateur :
   ```bash
   git clone https://github.com/<ton-pseudo>/GAMES-ZONE.git
   cd GAMES-ZONE
   ```
3. **Crée une branche** dédiée à ton changement (ne travaille pas sur `main`) :
   ```bash
   git checkout -b feat/mon-super-jeu
   ```
4. **Installe et lance** le projet :
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
5. **Fais tes modifications**, puis **vérifie que tout passe** (c'est ce que la CI
   contrôlera de toute façon) :
   ```bash
   npm run format   # met en forme le code
   npm run lint     # analyse le code
   npm test         # tests unitaires
   npm run build    # vérifie les types + build de production
   ```
6. **Commit et pousse** sur ta branche :
   ```bash
   git add .
   git commit -m "Ajout du jeu Pong"
   git push origin feat/mon-super-jeu
   ```
7. **Ouvre une Pull Request** vers `main` du dépôt d'origine. Décris ce que tu as
   fait. La CI se lance automatiquement ; une fois verte ✅, la PR peut être fusionnée.

## Ajouter un nouveau jeu

L'architecture est faite pour que ce soit simple. Pour ajouter un jeu `pong` :

1. **Une ligne** dans le tableau `games` de `vite.config.ts` :
   ```ts
   { key: 'pong', label: 'Pong', color: '--color-pong', controls: [ /* ... */ ] }
   ```
   - `key` = le nom du dossier (sert aussi de nom d'icône et d'état actif du menu)
   - `color` = un token de couleur défini dans `public/css/base/variables.css`
2. Créer la page et le code dans `src/pong/` :
   - `src/pong/index.html` — la page (≈ 15 lignes, voir un jeu existant)
   - `src/pong/pong-main.ts` — le point d'entrée (≈ 3 lignes)
   - `src/pong/Pong.ts` — la logique, qui **étend `GameEngine`** (`src/shared/GameEngine.ts`)
3. Créer l'icône `public/icons/pong.svg`.

Le jeu apparaît alors **automatiquement** dans le menu et sur la page d'accueil
(tout est piloté par le tableau `games`). Inspire-toi d'un jeu existant comme `snake`.

## Bonnes pratiques

- **Une PR = un sujet** (un jeu, un bug, une amélioration). Plus c'est ciblé, plus
  c'est facile à relire et à fusionner.
- Respecte le style existant (TypeScript `strict`, design tokens CSS, mobile-first).
  Le format est géré par **Prettier** et le style de code par **ESLint** — lance-les
  avant de pousser.
- Pas de backend : les scores restent en `localStorage`.
- Une question ou une idée avant de coder ? Ouvre une **Issue** pour en discuter.

Merci ! 🙌
</content>
