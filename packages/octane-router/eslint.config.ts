import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    ignores: [
      'tests/_fixtures/**',
      'tests/conformance/**',
      'tests/_helpers.ts',
    ],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
]
