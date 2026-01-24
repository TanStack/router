// @ts-check

import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    rules: {
      // We explicitly annotate `isServer: boolean` even though it's inferrable
      // because the explicit type is important for documentation and ensures
      // consistent typing across all conditional export files
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
]
