import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.flat.recommended.rules },
  },
  { files: ['vite.config.ts', 'eslint.config.js'], languageOptions: { globals: globals.node } },
);
