// @ts-check

import rootConfig from '../../eslint.config.js'
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

export default [
  ...rootConfig,
  {
    // Main's tests of features that are not compilers, unchanged from main,
    // which does not lint its tests (`test:noncompiler` runs them).
    ignores: noncompilerTests.map((file) => `tests/${file}`),
  },
]
