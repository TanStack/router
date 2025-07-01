import solidPlugin from 'vite-plugin-solid'
import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      solidPlugin: solidPlugin(),
    },
    rules: {
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
