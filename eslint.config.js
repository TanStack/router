// @ts-check

// @ts-expect-error
import { tanstackConfig } from '@tanstack/config/eslint'

export default [
  ...tanstackConfig,
  {
    name: 'tanstack/temp',
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-shadow': 'off',
    },
  },
]
