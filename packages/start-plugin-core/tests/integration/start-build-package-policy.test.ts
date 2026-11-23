/**
 * Start values in installed packages, in real Start builds (Vite and
 * Rsbuild), node_modules policy decisions 2, 4, 6, 9 and 11:
 * - a package that declares Start (`peerDependencies`, `dependencies`,
 *   `optionalDependencies`, on `@tanstack/<fw>-start` or one of the packages
 *   a Start value comes from) is read on demand: a builder one of its
 *   modules hands to another under a new name, with no builder call there,
 *   is followed, and the app's handler built on it leaves the client;
 * - a package that does not declare Start is not read: the same handler
 *   ships (as before the policy), and the build warns once that the package
 *   must declare Start; a package naming Start in `peerDependenciesMeta`
 *   only gets no warning;
 * - a route file the router generator registered from a package is
 *   compiled like the app's: split, its server handlers off the client.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, callByIdExports, startBundlers } from '../build-harness'
import { appManifest, installPackage } from '../package-layouts'
import { probeRoute } from '../request-probe'
import type { StartBundler } from '../build-harness'
import type { PackageLayout, StartDeclaration } from '../package-layouts'

const timeout = 60_000

/**
 * `fwd-lib`: `base.js` makes a server fn builder, `index.js` hands it on as
 * `authed` without naming any Start API.
 */
const forwardingLib = (declaration: StartDeclaration) => ({
  name: 'fwd-lib',
  declaration,
  files: {
    'base.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn({ method: 'POST' })\n`,
    'index.js': `import { base } from './base.js'\nexport const authed = base\n`,
  },
})

/** The app, its handler built on `fwd-lib`'s `authed`. */
function app(layout: PackageLayout, declaration: StartDeclaration) {
  const lib = installPackage(layout, forwardingLib(declaration))
  return {
    lib,
    options: {
      files: {
        ...lib.files,
        'src/fns.ts': `import { authed } from '${lib.importAs}'\nexport const fn = authed.handler(async () => 'MARK_HANDLER_BODY')\n`,
        'src/entry.ts': `export { fn } from './fns'\n`,
        'src/ssr-entry.ts': `export { fn } from './fns'\n${callByIdExports}`,
      },
      symlinks: lib.symlinks,
      packageJson: appManifest([lib]),
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
    },
  }
}

describe.each(startBundlers)('%s build', (bundler: StartBundler) => {
  // On main, the handler leaves the client (main compiled every module of a
  // package it discovered); before the policy, the PR's compiler read a
  // package's module only when its text named a Start API.
  // Source: node_modules policy, decisions 2 (A) and 9 (A); the reviews'
  // `optional-declaration`.
  test.each<[PackageLayout, StartDeclaration]>([
    ['npm', 'peer'],
    ['pnpm', 'optional-peer'],
    ['npm', 'dependency'],
    ['alias', 'optional-dependency'],
    ['npm', 'start-server-core'],
  ])(
    'a builder a Start package (%s layout, %s) forwards under a new name: the app handler leaves the client, no warning',
    async (layout, declaration) => {
      const { options } = app(layout, declaration)
      const build = await buildStart({ bundler, ...options })
      expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
      expect(build.ssr.where('MARK_HANDLER_BODY')).not.toBe('nowhere')
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  // A package that does not declare Start is not read on demand: the
  // forwarded builder is not followed (decision 11), and the compile of a
  // module of it that uses Start warns that it must declare Start: once for
  // the package, whichever of its two modules using Start compiles first.
  // Source: node_modules policy, decisions 6 (A, case i) and 11 (A).
  test(
    'a package that does not declare Start: one warning, naming one of its modules',
    async () => {
      const { lib, options } = app('npm', 'none')
      const build = await buildStart({
        bundler,
        ...options,
        files: {
          ...options.files,
          [`${lib.directory}/other.js`]: `import { createServerFn } from '@tanstack/react-start'\nexport const other = createServerFn({ method: 'GET' })\n`,
          'src/entry.ts': `import { other } from 'fwd-lib/other.js'\nexport { fn } from './fns'\nexport const kind = () => typeof other\n`,
        },
      })
      const named = ['base.js', 'other.js'].filter(
        (file) =>
          findDiagnostics(problems(build.diagnostics), {
            severity: 'warning',
            file: `${lib.directory}/${file}`,
            root: build.root,
          }).length > 0,
      )
      expect(named).toHaveLength(1)
    },
    timeout,
  )

  // `@tanstack/react-form` 1.33.5's shape: Start named in
  // `peerDependenciesMeta` only, an integration the package left optional.
  // Source: node_modules policy, decision 6 (A, case iii).
  test(
    'a package naming Start in peerDependenciesMeta only: no warning',
    async () => {
      const { options } = app('npm', 'peer-meta-only')
      const build = await buildStart({ bundler, ...options })
      expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
    },
    timeout,
  )

  // On main, Vite's build compiled a route file the generator registered
  // from a package (Rsbuild did not); before the policy, the PR compiled it
  // only when its text named a Start API, so its `server` handlers shipped
  // and it was not split.
  // Source: node_modules policy, decision 4 (A).
  test(
    'a route file registered from a package is split, its server handler off the client and answering on the server',
    async () => {
      const routes = 'node_modules/@acme/routes'
      const build = await buildStart({
        bundler,
        files: {
          [`${routes}/package.json`]: JSON.stringify({
            name: '@acme/routes',
            version: '1.0.0',
            peerDependencies: { '@tanstack/react-start': '*' },
          }),
          [`${routes}/__root.tsx`]: `import { createRootRoute } from '@tanstack/react-router'\nexport const Route = createRootRoute()\n`,
          // (the harness runs server scripts inside a request of its probe route)
          [`${routes}/harness-probe.ts`]: probeRoute('@tanstack/react-router'),
          [`${routes}/api.tsx`]: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api')({
  server: { handlers: { GET: () => new Response('MARK_SERVER_GET') } },
  component: () => <p>MARK_COMPONENT</p>,
})
`,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'\n`,
          'src/ssr-entry.ts': `export { getRouter } from './router'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { router: { routesDirectory: `../${routes}` } },
      })
      expect(build.client.where('MARK_SERVER_GET')).toBe('nowhere')
      expect(build.client.where('MARK_COMPONENT')).toBe('lazy')
      const { result } = await build.ssr.run(
        `return await (await entry.startServerEntry.fetch(new Request('http://localhost/api'))).text()`,
      )
      expect(result).toBe('MARK_SERVER_GET')
    },
    timeout,
  )

  // A Start package's module is read like the app's: its namespace handed
  // to code the compiler cannot follow carries its builder there, which is
  // refused as for an app module (an ordinary package's is not read).
  // Source: node_modules policy, decision 7 (A, S4).
  test(
    "a Start package's namespace passed to unknown code fails the build at the use",
    async () => {
      const lib = installPackage('npm', forwardingLib('peer'))
      const error = await buildStart({
        bundler,
        files: {
          ...lib.files,
          'src/entry.ts': `import * as lib from 'fwd-lib'\nexport const keys = () => Object.keys(lib)\n`,
        },
        symlinks: lib.symlinks,
        packageJson: appManifest([lib]),
        entry: 'src/entry.ts',
      }).then(
        () => null,
        (e: unknown) => e as { diagnostics?: Array<unknown> },
      )
      expect(error).not.toBeNull()
      expectDiagnostic(error!.diagnostics, {
        severity: 'error',
        file: 'src/entry.ts',
        root: (error as { root?: string }).root,
      })
    },
    timeout,
  )
})

// Rsbuild's persistent cache keeps a plan made under one manifest: a
// manifest-only edit that makes the package declare Start (or stop) gives
// the output of a fresh build, in both directions.
// Source: node_modules policy, section 5.3 (the class is an input of the
// importer's plan, revalidated by its target facts).
describe('rsbuild build on the persistent cache', () => {
  test.each<[StartDeclaration, StartDeclaration, string]>([
    ['none', 'peer', 'nowhere'],
    ['peer', 'none', 'eager'],
  ])(
    'a manifest edit from %s to %s: the rebuild is the fresh build',
    async (from, to, handler) => {
      const { lib, options } = app('npm', from)
      const first = await buildStart({
        bundler: 'rsbuild',
        ...options,
        rsbuildConfig: { performance: { buildCache: true } },
      })
      const edited = installPackage('npm', forwardingLib(to)).files[
        `${lib.directory}/package.json`
      ]!
      const second = await first.rebuild({
        [`${lib.directory}/package.json`]: edited,
      })
      const where = second.client.where('MARK_HANDLER_BODY')
      expect(where === 'nowhere' ? 'nowhere' : 'eager').toBe(handler)
    },
    timeout,
  )
})
