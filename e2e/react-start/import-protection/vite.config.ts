import path from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// Allow env var to override the import protection behavior.
// Default: 'mock' (build completes, violations logged as warnings).
// Set BEHAVIOR=error to test that the build fails on violations.
const behavior = (process.env.BEHAVIOR ?? 'mock') as 'mock' | 'error'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
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
  // react-tweet's package.json exports resolve to `index.client.js` which
  // matches the default **/*.client.* deny pattern.  Bundling it via
  // noExternal must NOT trigger a false-positive import-protection violation.
  ssr: {
    noExternal: ['react-tweet'],
  },
})
