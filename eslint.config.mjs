// ESLint for the Node scripts (scripts/), the shared library (src/shared/) and the web app (src/app, src/modules).
// The Apps Script files (*.gs, *.html in apps-script/) run inside Google, with their own
// globals (SpreadsheetApp, UrlFetchApp…), and are not linted here yet.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'scripts/out/', 'secrets/', 'apps-script/', '.next/', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx,mts,js,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  // The web app (Next.js): its client components run in the browser.
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/modules/**/*.{ts,tsx}', 'src/shared/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // Last: turns off every rule that would fight with Prettier.
  prettier,
);
