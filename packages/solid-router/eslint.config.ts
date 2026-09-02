import solidPlugin from '@solidjs/vite-plugin'
import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    ignores: ['bin/**', 'repro-external-ssr/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      solidPlugin: solidPlugin(),
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
