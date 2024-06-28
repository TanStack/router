// @ts-check

// @ts-ignore Needed due to moduleResolution Node vs Bundler
import { tanstackConfig } from '@tanstack/config/eslint'

export default [
  ...tanstackConfig,
  {
    name: 'tanstack/local',
    rules: {
      'ts/ban-types': 'off',
      'ts/require-await': 'off',
      'no-empty': 'off',
      'no-prototype-builtins': 'off',
      'no-shadow': 'off',
    },
  },
]
