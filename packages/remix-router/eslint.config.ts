import rootConfig from '../../eslint.config.js'
import type { Linter } from 'eslint'

export default [
  ...rootConfig,
  {
    // The tests rely on routes that aren't actually generated for this
    // package (no FileRoutesByPath registrations) and on a few binding
    // type gaps that are tracked separately. Skip them for now —
    // vitest still runs them at runtime, just without type-aware lint.
    ignores: [
      'example/**',
      'dist/**',
      'tests/**',
      'vitest.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
  },
  {
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
] as Array<Linter.Config>
