import { defineConfig } from 'vitest/config';

// Config dédiée aux tests unitaires (Vitest la préfère à vite.config.ts).
// On NE charge pas le plugin Handlebars ni `root: src` : les tests visent la
// logique pure (TS), pas le rendu HTML/DOM des pages.
export default defineConfig({
  test: {
    // happy-dom fournit localStorage, KeyboardEvent, etc. aux tests.
    environment: 'happy-dom',
    // Tests co-localisés avec le code, sous src/.
    include: ['src/**/*.{test,spec}.ts'],
  },
});
