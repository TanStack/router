// @ts-check

import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    // Route files the tests copy into their apps, and the output snapshots
    // of the Babel-based compiler, outside the TypeScript project
    // (tsconfig.json)
    ignores: ['tests/**/test-files/**', 'tests/**/snapshots/**'],
  },
]
