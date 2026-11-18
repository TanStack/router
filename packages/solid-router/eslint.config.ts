import solidPlugin from 'vite-plugin-solid'
import rootConfig from '../../eslint.config.js'
import type { Linter } from 'eslint'

const config: Array<Linter.Config> = [
  ...rootConfig,
  {
    ignores: ['bin/**'],
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

export default config
