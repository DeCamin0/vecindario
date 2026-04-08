import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const unusedVarsRule = ['error', { varsIgnorePattern: '^[A-Z_]' }]

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'server/dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': unusedVarsRule,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['server/**/*.ts'],
  })),
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
    },
  },
])
