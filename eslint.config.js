// @ts-check

// @ts-expect-error
import { tanstackConfig } from '@tanstack/config/eslint'

import pluginRouter from '@tanstack/eslint-plugin-router'

export default [
  ...tanstackConfig,
  ...pluginRouter.configs['flat/recommended'],
  {
    name: 'tanstack/temp',
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-shadow': 'off',
    },
  },
]
