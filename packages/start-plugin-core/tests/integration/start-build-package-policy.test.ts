/**
 * Start values in installed packages, in real Start builds (Vite and
 * Rsbuild), node_modules policy decisions 2, 4, 6, 9 and 11:
 * - a package that declares Start (`peerDependencies`, `dependencies`,
 *   `optionalDependencies`, on `@tanstack/<fw>-start` or one of the packages
 *   a Start value comes from) is read on demand: a builder one of its
 *   modules hands to another under a new name, with no builder call there,
 *   is followed, and the app's handler built on it leaves the client;
 * - a package that does not declare Start: every module of it an import
 *   resolution reaches has a summary too (pile-of-cases item 2a), and the
 *   build warns once that the package must declare Start; a package naming
 *   Start in `peerDependenciesMeta` only gets no warning;
 * - a route file the router generator registered from a package is
 *   compiled like the app's: split, its server handlers off the client.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { callByIdExports, startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import { appManifest, installPackage } from '../package-layouts'
import { probeRoute } from '../request-probe'
import type { StartBundler } from '../build-harness'
import type { PackageLayout, StartDeclaration } from '../package-layouts'

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
  )

  // Under an app directory whose name has a `#` (which Rspack escapes in a
  // module's resource), the package's manifest is the one the warning reads.
  // Source: round-3 re-checks of the node_modules policy implementation
  // (Fable N1 `probes/p14.test.ts`, Astra 3 `hash#project`, Gemini 2a).
  test('a Start package under a project path with a `#`: the handler leaves the client, no warning', async () => {
    const { options } = app('npm', 'peer')
    const build = await buildStart({
      bundler,
      ...options,
      prefix: `.start-build-harness-${bundler} C# project #2-`,
    })
    expect(build.root).toMatch(/C# project #2/)
    expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
    expect(
      problems(build.diagnostics)
        .map(({ text }) => text)
        // (Vite's own warning of the root's `#`)
        .filter((text) => !text.includes('contains the "#" character')),
    ).toEqual([])
  })

  // The compile of a module of a package that does not declare Start and
  // uses Start warns that it must declare Start: once for the package,
  // whichever of its two modules using Start compiles first.
  // Source: node_modules policy, decisions 6 (A, case i) and 11 (A).
  test('a package that does not declare Start: one warning, naming one of its modules', async () => {
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
  })

  // `@tanstack/react-form` 1.33.5's shape: Start named in
  // `peerDependenciesMeta` only, an integration the package left optional,
  // by any name that declares Start (decision 9's set); a name outside it
  // declares nothing and is no exception.
  // Source: node_modules policy, decision 6 (A, case iii); reviews of the
  // implementation (Astra 5 `head-vite-meta-rsc`, Gemini F6.3).
  test.each<[string, boolean]>([
    ['@tanstack/react-start', false],
    ['@tanstack/react-start-rsc', false],
    ['@tanstack/start-plugin-core', true],
  ])(
    'a package naming %s in peerDependenciesMeta only: warned %s',
    async (name, warned) => {
      const { lib, options } = app('npm', 'none')
      const manifest = JSON.parse(
        lib.files[`${lib.directory}/package.json`]!,
      ) as Record<string, unknown>
      const build = await buildStart({
        bundler,
        ...options,
        files: {
          ...options.files,
          [`${lib.directory}/package.json`]: JSON.stringify({
            ...manifest,
            peerDependenciesMeta: { [name]: { optional: true } },
          }),
        },
      })
      expect(problems(build.diagnostics).length > 0).toBe(warned)
    },
  )

  // On main, Vite's build compiled a route file the generator registered
  // from a package (Rsbuild did not); before the policy, the PR compiled it
  // only when its text named a Start API, so its `server` handlers shipped
  // and it was not split.
  // Source: node_modules policy, decision 4 (A).
  test('a route file registered from a package is split, its server handler off the client and answering on the server', async () => {
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
  })

  // A warning whose fix is an edit of the module it points at is for the
  // module's author: an installed package's module does not get it (Clerk's
  // `clerkMiddleware(options)` in a corpus app), a workspace package's
  // (which the user writes) does, at the parameter.
  // Source: diagnostics spike (2026-11-24), inventory flag 3, agreed
  // change A2.
  test.each<[PackageLayout, boolean]>([
    ['npm', false],
    ['pnpm', false],
    ['workspace', true],
  ])(
    "a %s Start package's middleware factory reading its parameter in `.server()`: warned %s",
    async (layout, warned) => {
      const lib = installPackage(layout, {
        name: 'mw-lib',
        declaration: 'peer',
        files: {
          'index.js': `import { createMiddleware } from '@tanstack/react-start'
export const guard = (options) => createMiddleware({ type: 'function' }).server(async ({ next }) => { if (options.rule !== 'MARK_RULE') { throw new Error('denied') } return next() })
`,
        },
      })
      const build = await buildStart({
        bundler,
        files: {
          ...lib.files,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'\nimport { guard } from 'mw-lib'\nexport const fn = createServerFn().middleware([guard({ rule: 'MARK_RULE' })]).handler(async () => 'MARK_HANDLER_BODY')\n`,
          'src/entry.ts': `export { fn } from './fns'\n`,
          'src/ssr-entry.ts': `export { fn } from './fns'\n${callByIdExports}`,
        },
        symlinks: lib.symlinks,
        packageJson: appManifest([lib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
      if (warned) {
        expectDiagnostic(problems(build.diagnostics), {
          severity: 'warning',
          file: `${lib.directory}/index.js`,
          root: build.root,
          position: { line: 2, column: 23 },
        })
      } else {
        expect(problems(build.diagnostics).map(({ text }) => text)).toEqual([])
      }
    },
  )

  // An error stays, whoever wrote the module, and names the package: the
  // app updates it or reports it to the package's maintainers.
  // Source: diagnostics spike (2026-11-24), agreed change A2.
  test("a refusal in a Start package's module fails the build naming the package", async () => {
    const lib = installPackage('npm', {
      name: 'old-lib',
      declaration: 'peer',
      files: {
        'index.js': `import { createServerFn } from '@tanstack/react-start'\nexport const fn = createServerFn().inputValidator((d) => d).handler(async () => 'MARK_HANDLER_BODY')\n`,
      },
    })
    const error = await buildStart({
      bundler,
      files: {
        ...lib.files,
        'src/entry.ts': `export { fn } from 'old-lib'\n`,
      },
      symlinks: lib.symlinks,
      packageJson: appManifest([lib]),
      entry: 'src/entry.ts',
    }).then(
      () => null,
      (e: unknown) => e as { diagnostics?: Array<unknown>; root?: string },
    )
    expect(error).not.toBeNull()
    const refusal = expectDiagnostic(error!.diagnostics, {
      severity: 'error',
      file: `${lib.directory}/index.js`,
      root: error!.root,
      position: { line: 2 },
    })
    expect(refusal.text).toContain('installed package `old-lib`')
  })

  // The same for server code passed by a name the package's module assigns
  // elsewhere (`start-server-code-reassigned`): an error, so it is not
  // dropped as advice for the module's author, and it names the package.
  // Source: reassigned binding at every server-code position (2026-11-24).
  test("a server-only fn on a reassigned name in a Start package's module fails the build naming the package", async () => {
    const lib = installPackage('npm', {
      name: 'reassign-lib',
      declaration: 'peer',
      files: {
        'index.js': `import { createServerOnlyFn } from '@tanstack/react-start'\nlet impl = () => 'MARK_SERVER_FIRST'\nimpl = () => 'MARK_SERVER_SECOND'\nexport const read = createServerOnlyFn(impl)\n`,
      },
    })
    const error = await buildStart({
      bundler,
      files: {
        ...lib.files,
        'src/entry.ts': `export { read } from 'reassign-lib'\n`,
      },
      symlinks: lib.symlinks,
      packageJson: appManifest([lib]),
      entry: 'src/entry.ts',
    }).then(
      () => null,
      (e: unknown) => e as { diagnostics?: Array<unknown>; root?: string },
    )
    expect(error).not.toBeNull()
    const refusal = expectDiagnostic(error!.diagnostics, {
      severity: 'error',
      file: `${lib.directory}/index.js`,
      root: error!.root,
      position: { line: 4 },
    })
    expect(refusal.text).toContain('installed package `reassign-lib`')
  })

  // A package's module that calls `.handler()` on a builder another of its
  // modules makes, through a barrel that renames the factory: no Start name
  // in the builder's module. Every dependency module an import resolution
  // reaches has a summary, whatever its text (main reads them on demand),
  // so the handler is compiled off the client in a package that does not
  // declare Start too. Main leaked the optional call, the PR both.
  // Source: pile-of-cases item 2a (2026-11-26), compile-scope study.
  test.each([
    ['base.handler(fn)', 'base.handler'],
    ['base?.handler(fn)', 'base?.handler'],
  ])(
    'a package that does not declare Start, %s with base made in another module: the handler leaves the client',
    async (_shape, call) => {
      const lib = installPackage('npm', {
        name: 'dep-x',
        declaration: 'none',
        files: {
          'barrel.js': `export { createServerFn as make } from '@tanstack/react-start'\n`,
          'base.js': `import { make } from './barrel.js'\nexport const base = make({ method: 'POST' })\n`,
          'fn.js': `import { base } from './base.js'\nexport const fn = ${call}(async () => 'MARK_HANDLER_BODY')\n`,
          'index.js': `export { fn } from './fn.js'\n`,
        },
      })
      const build = await buildStart({
        bundler,
        files: {
          ...lib.files,
          'src/entry.ts': `export { fn } from 'dep-x'\n`,
          'src/ssr-entry.ts': `export { fn } from 'dep-x'\n${callByIdExports}`,
        },
        packageJson: appManifest([lib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(build.client.where('MARK_HANDLER_BODY')).toBe('nowhere')
    },
  )

  // A Start package's module is read like the app's: its namespace handed
  // to code the compiler cannot follow carries its builder there, which is
  // refused as for an app module (an ordinary package's namespace is not checked: the class decides
  // that check, not the summaries).
  // Source: node_modules policy, decision 7 (A, S4).
  test("a Start package's namespace passed to unknown code fails the build at the use", async () => {
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
  })
})

// A summary is the module's own business: one whose analysis cannot be
// built (a very long chain overflows the value analysis' stack) is no
// summary, as for a module that does not parse, and its importer builds.
// Vite only: Rspack's own pipeline fails on a 5,000-term expression.
// Source: review of the dependency summaries (2026-11-27, Fable finding 1,
// Gemini).
describe('vite build, a package whose module has an export Start cannot read', () => {
  test('a 5,000-term chain in an export the app does not use: the app builds and keeps the export it uses', async () => {
    const chain = Array.from({ length: 5000 }, (_, i) => `c === ${i}`).join(
      ' || ',
    )
    const lib = installPackage('npm', {
      name: 'dep-y',
      declaration: 'none',
      files: {
        'index.js': `export const unused = (c) => ${chain}\nexport const used = () => 'MARK_USED_EXPORT'\n`,
      },
    })
    const build = await buildStart({
      bundler: 'vite',
      files: {
        ...lib.files,
        'src/entry.ts': `import { used } from 'dep-y'\nexport const label = () => used()\n`,
      },
      packageJson: appManifest([lib]),
      entry: 'src/entry.ts',
    })
    expect(build.client.where('MARK_USED_EXPORT')).not.toBe('nowhere')
  })
})

// Rsbuild's persistent cache restores a module without compiling it: the
// warning its compile recorded is reported again, so a warm build of a
// package that does not declare Start still warns (decision 11 A rests on
// the warning).
// Source: Fable's review of the node_modules policy implementation,
// finding 2 (`probes/p3.test.ts`, W1).
describe('rsbuild build on the persistent cache, a package that does not declare Start', () => {
  test('the warm build warns as the cold one', async () => {
    const { lib, options } = app('npm', 'none')
    const warns = (build: { diagnostics: unknown; root: string }) =>
      findDiagnostics(problems(build.diagnostics as never), {
        severity: 'warning',
        file: `${lib.directory}/base.js`,
        root: build.root,
      }).length > 0
    const first = await buildStart({
      bundler: 'rsbuild',
      ...options,
      rsbuildConfig: { performance: { buildCache: true } },
    })
    expect(warns(first)).toBe(true)
    const second = await first.rebuild({})
    expect(warns(second)).toBe(true)
  })
})
