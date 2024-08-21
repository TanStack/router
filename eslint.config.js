// @ts-check

// @ts-expect-error
import { tanstackConfig } from '@tanstack/config/eslint'

export default [
  ...tanstackConfig,
  {
    name: 'tanstack/temp',
    rules: {
      '@typescript-eslint/ban-types': 'off',
      'no-shadow': 'off',
    },
  },
]
