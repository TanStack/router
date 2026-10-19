// @ts-check

import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    // TEMPORARY (compiler-tests W3-speed-spc): the import-protection test
    // files are being reworked on another branch (W3-harness2); they are
    // linted once it merges. Remove this block then.
    ignores: [
      'tests/**/importProtection/**',
      'tests/integration/rsbuild/import-protection.test.ts',
    ],
  },
]
