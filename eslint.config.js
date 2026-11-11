// @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

import unusedImports from 'eslint-plugin-unused-imports'

// Packages that set their own `no-restricted-syntax` must include this entry.
export const routerCoreAugmentation = {
  selector: "TSModuleDeclaration[id.value='@tanstack/router-core']",
  message:
    "Augment '@tanstack/router-core/extensions' instead. Augmenting the main entry makes emitted declarations import router types from '@tanstack/router-core' (see packages/router-core/src/extensions.ts).",
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...tanstackConfig,
  {
    name: 'tanstack/router-core-augmentation',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', routerCoreAugmentation],
    },
  },
  {
    name: 'tanstack/temp',
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-shadow': 'off',
    },
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
]
