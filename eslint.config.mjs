// ESLint for the Node scripts (scripts/) and the shared library (src/shared/).
// The Apps Script files (src/*.gs, src/*.html) run inside Google, with their own
// globals (SpreadsheetApp, UrlFetchApp…), and are not linted here yet.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'scripts/out/', 'secrets/', 'src/*.gs', 'src/*.html'],
  },
  {
    files: ['**/*.{ts,mts,js,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Last: turns off every rule that would fight with Prettier.
  prettier,
);
