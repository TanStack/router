// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Route files the tests copy into their apps, outside the TypeScript
    // project (tsconfig.json)
    ignores: ['tests/**/test-files/**'],
  },
]
