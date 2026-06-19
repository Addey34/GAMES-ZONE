import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

// Flat config (ESLint 10). Cible le code source TS ; le rendu HTML/CSS et le
// build sont hors périmètre. `prettier` est placé en dernier pour désactiver
// les règles de style qui entreraient en conflit avec le formateur.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      // TypeScript (lib DOM) connaît déjà document/window/etc. : no-undef ferait
      // double emploi et lèverait des faux positifs sur les globales du navigateur.
      'no-undef': 'off',
      // Convention du projet : les imports entre modules src/ portent l'extension
      // .js même si le fichier est .ts (résolution Vite/ESM). On la rend obligatoire.
      'import-x/extensions': ['error', 'always', { ignorePackages: true }],
      // Les paramètres/variables préfixés par _ sont volontairement inutilisés
      // (hooks du moteur), comme le fait déjà tsconfig (noUnusedParameters).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier
);
