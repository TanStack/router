import path from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

// Allow env var to override the import protection behavior.
// Default: 'mock' (build completes, violations logged as warnings).
// Set BEHAVIOR=error to test that the build fails on violations.
const behavior = (process.env.BEHAVIOR ?? 'mock') as 'mock' | 'error'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tanstackStart({
      importProtection: {
        behavior,
        log: 'always',
        // Tests capture structured violations by overriding this hook.
        // If unset, we avoid generating any violations*.json files.
        onViolation: (info) => {
          void info
        },
      },
    }),
  ],
  // Keep the unused import from being tree-shaken in older TS configs
  define: {
    __IMPORT_PROTECTION_FIXTURE_ROOT__: JSON.stringify(
      path.resolve(import.meta.dirname),
    ),
  },
})
