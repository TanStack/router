// @ts-check

import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    // The generator's fixture apps (route files, virtual route configs):
    // inputs the tests generate route trees from, most outside the
    // TypeScript project (tsconfig.json). Their type tests are linted.
    ignores: [
      'tests/generator/**/*.{ts,tsx,js,jsx}',
      '!tests/generator/**/*.test-d.ts',
    ],
  },
]
