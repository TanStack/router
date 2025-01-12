import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    files: ['src/templates/**/template/**/*', 'src/modules/**/template/**/*'],
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-nocheck': false,
        },
      ],
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
]
