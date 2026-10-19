// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../known-bugs-code-splitter.test.ts (fast tier).
/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

/**
 * Bundlers whose router plugin splits routes (the esbuild adapter does not;
 * pinned in build-harness.test.ts).
 */
const clientBundlers: Array<Bundler> = ['vite', 'rspack', 'webpack']

describe('server-only route options on the client', () => {
  /** Start's client configuration of the code splitter. */
  const deleteNodes = ['ssr', 'server', 'headers']

  /** A client build with Start's `deleteNodes`, reading a server secret. */
  async function secretPlacement(bundler: Bundler, option: string) {
    const app = await build({
      bundler,
      env: 'client',
      pluginOptions: { codeSplittingOptions: { deleteNodes } },
      files: routeApp(
        `${head}import { readSecret } from '../db.server'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>page</p>,
})
`,
        {
          env: 'client',
          files: {
            'db.server.ts': `export function readSecret() {
  return (globalThis as any).MARK_SERVER_SECRET
}
`,
          },
        },
      ),
    })
    return app.where('MARK_SERVER_SECRET')
  }

  // Control for the build-level canary below.
  test.each(clientBundlers)(
    'a client build has no server code of an `ssr` property (%s)',
    async (bundler) => {
      expect(await secretPlacement(bundler, 'ssr: () => !!readSecret()')).toBe(
        'nowhere',
      )
    },
    60_000,
  )

  // Bug: build-level canary of the method pin above (same root cause).
  // Impact: the server code of an `ssr()` method reaches the client bundle.
  test.fails.each(clientBundlers)(
    'a client build has no server code of an `ssr()` method (%s)',
    async (bundler) => {
      expect(
        await secretPlacement(bundler, 'ssr() { return !!readSecret() }'),
      ).toBe('nowhere')
    },
    60_000,
  )
})

describe('symlinked route files', () => {
  /**
   * A client build with `deleteNodes: ['server']` of a route file reached
   * through `routes/index.tsx`, a symlink when `linked`; returns where the
   * server handler's code is, or `refused` when the build fails naming the
   * route file.
   */
  async function serverCodePlacement(bundler: Bundler, linked: boolean) {
    const route = `${head}import { readSecret } from '../db.server'
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => readSecret() } },
  component: () => <p>page</p>,
})
`
    const files = routeApp(route, {
      env: 'client',
      files: {
        'db.server.ts': `export function readSecret() {
  return (globalThis as any).MARK_SERVER_SECRET
}
`,
      },
    })
    if (linked) {
      delete files['routes/index.tsx']
      files['linked/index.tsx'] = route
    }
    try {
      const app = await build({
        bundler,
        env: 'client',
        pluginOptions: { codeSplittingOptions: { deleteNodes: ['server'] } },
        files,
        symlinks: linked ? { 'routes/index.tsx': 'linked/index.tsx' } : {},
      })
      return app.where('MARK_SERVER_SECRET')
    } catch (error) {
      // A refusal names the route file
      if (
        error instanceof BuildError &&
        error.errors.join('\n').includes('index.tsx')
      ) {
        return 'refused'
      }
      throw error
    }
  }

  // Control for the pin below (same app, a regular route file).
  test.each(clientBundlers)(
    'a client build has no server handler code (%s)',
    async (bundler) => {
      expect(await serverCodePlacement(bundler, false)).toBe('nowhere')
    },
    60_000,
  )

  // Bug: the code splitter looks route files up by the path the generator
  // scanned (the symlink), but bundlers resolve modules to their real path,
  // so a symlinked route file is never compiled: nothing is split or
  // removed, silently. Failing the build is a valid fix too. Source: #8514.
  // Impact: with symlinked sources (Bazel, Nix, linked checkouts), Start's
  // client bundle ships `server.handlers` and their server-only imports.
  test.fails.each(clientBundlers)(
    'a client build of a symlinked route file has no server handler code (%s)',
    async (bundler) => {
      expect(['nowhere', 'refused']).toContain(
        await serverCodePlacement(bundler, true),
      )
    },
    60_000,
  )
})

describe('source maps', () => {
  /**
   * Source files named by the source maps of a client build's chunks that
   * hold the split component (`MARK_PAGE`) or a binding the route module
   * shares with it (`MARK_SHARED`).
   */
  async function splitChunkSources(bundler: Bundler) {
    const app = await build({
      bundler,
      env: 'client',
      minify: false,
      sourcemap: true,
      files: routeApp(
        `${head}const shared = { label: 'MARK_SHARED' }
function Page() {
  return <p>MARK_PAGE {shared.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`,
        { env: 'client' },
      ),
    })
    const chunks = app.chunks.filter(
      (chunk) =>
        chunk.code.includes('MARK_PAGE') || chunk.code.includes('MARK_SHARED'),
    )
    return [...new Set(chunks.flatMap((chunk) => chunk.map?.sources ?? []))]
  }

  /** Whether the sources name the route file, and none a virtual module. */
  function namesRouteFile(sources: Array<string>) {
    return {
      routeFile: sources.some((source) => source.includes('routes/index.tsx')),
      virtualModules: sources.filter((source) => /[?&]tsr-/.test(source)),
    }
  }

  // Control for the pin below: Rspack and webpack name modules by their
  // resource path.
  test.each(['rspack', 'webpack'] as const)(
    'split code maps to the route file (%s)',
    async (bundler) => {
      expect(namesRouteFile(await splitChunkSources(bundler))).toEqual({
        routeFile: true,
        virtualModules: [],
      })
    },
    60_000,
  )

  // Bug: the split chunk and shared modules are compiled with their module
  // id as the source file name, query included (`routes/index.tsx?tsr-split=
  // component`), and Vite keeps the source names of the maps plugins return.
  // Source: gap CC-S2 (plausible cause of #6667, #3828, #2991).
  // Impact: devtools and error trackers show split code under a separate
  // `index.tsx?tsr-split=…` file, so breakpoints set in the route file do
  // not hit in split code.
  test.fails(
    'split code maps to the route file (vite)',
    async () => {
      expect(namesRouteFile(await splitChunkSources('vite'))).toEqual({
        routeFile: true,
        virtualModules: [],
      })
    },
    60_000,
  )
})

describe('production builds', () => {
  /**
   * A production client build, with `NODE_ENV` as given (`null`: unset), of
   * a route whose exported component the app's entry imports eagerly
   * (`export * from './routes/index'`): a pattern the compiler may leave
   * unsplit, telling the user at build time (J2.8). Mounts the route in the
   * browser; returns whether the component was split, whether the build
   * warned naming the route file, and whether the page logged a diagnostic
   * naming the route file (a development warning shipped in the bundle).
   */
  async function productionWarnings(bundler: Bundler, nodeEnv?: null) {
    const app = await build({
      bundler,
      env: 'client',
      nodeEnv,
      files: routeApp(
        `${head}export function Page() {
  return <p>MARK_PAGE</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
        { env: 'client' },
      ),
    })
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)',
    )
    expect(run.html).toContain('MARK_PAGE')
    const namingRoute = { file: 'routes/index.tsx', root: app.root }
    return {
      split: app.where('MARK_PAGE') === 'lazy',
      // The option name is pinned in code-splitter-imports-exports.test.ts
      warned:
        findDiagnostics([...app.warnings, ...app.consoleMessages], namingRoute)
          .length > 0,
      loggedInPage: findDiagnostics(run.logs, namingRoute).length > 0,
    }
  }

  // Control for the pin below: with `NODE_ENV=production` exported, the
  // build warns when it leaves the exported component eager (never when it
  // splits it), and the page logs nothing.
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle logs no development warning in the page; the build warns when the exported component stays eager (%s)',
    async (bundler) => {
      const { split, warned, loggedInPage } = await productionWarnings(bundler)
      expect(split || warned).toBe(true)
      expect(loggedInPage).toBe(false)
    },
    60_000,
  )

  // Bug: the code splitter's `console.warn` (today: "will not be
  // code-split") is injected into the route module unless the build
  // process's `NODE_ENV` is `production`, instead of following the
  // bundler's mode as the rest of the code splitter does. webpack and Rspack
  // set `NODE_ENV` only inside the bundle. Source: gap CC-P2.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` log a development warning in every user's console, with the
  // developer's absolute file path.
  test.fails.each(['rspack', 'webpack'] as const)(
    'a production client bundle logs no development warning in the page when NODE_ENV is unset (%s)',
    async (bundler) => {
      expect((await productionWarnings(bundler, null)).loggedInPage).toBe(false)
    },
    60_000,
  )
})
