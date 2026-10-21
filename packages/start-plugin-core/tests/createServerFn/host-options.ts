import type { StartHostOptions } from '../regression-helpers'

/**
 * The Start app of the server-fn compiler suites: Start's plugin with import
 * protection off (`importProtection.enabled: false`, a documented option).
 *
 * These suites judge what the Start compiler removes from the client (SPEC
 * J4.12): a page importing the module must not load the server-only modules
 * only a handler reads (`db.server.ts` and the like). With import protection
 * on (Start's default), a denied `*.server.*` import that a compiler leaves
 * in the client is replaced by a mock in dev, so the page never requests the
 * real module and a leak would pass unseen; and a client that legitimately
 * reads such a module gets the mock's runtime error. Import protection is a
 * compiler of its own (J6) with its own suites (`importProtection/`,
 * `integration/importProtection/`).
 *
 * The app's `tsconfig.json` sets `verbatimModuleSyntax` (a common project
 * setting, which Vite's TypeScript transform honours): an import the
 * compiler leaves in the client then stays and loads, as the old suite
 * judged loads; without it, the TypeScript transform after the compiler
 * would erase an unreferenced import and hide what the compiler kept.
 */
export const serverFnHostOptions = {
  start: { importProtection: { enabled: false } },
  files: {
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          verbatimModuleSyntax: true,
        },
      },
      null,
      2,
    )}\n`,
  },
} satisfies StartHostOptions
