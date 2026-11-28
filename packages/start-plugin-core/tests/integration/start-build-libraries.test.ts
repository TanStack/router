/**
 * Libraries written with Start APIs (uncompiled source) in real production
 * builds through Start's Vite and Rsbuild plugins (build-harness.ts), SPEC
 * J4.16, G11, J4.3: (a) a package whose only Start peer is
 * `@tanstack/start-client-core`, importing its APIs from there; (b) a
 * package without a Start peer, which the user bundles explicitly (Vite
 * `noExternal`, Rsbuild `source.include`); (c) the package of (a) linked
 * into `node_modules` by a real symlink from a directory outside it
 * (pnpm-style, #8139 as quoted); (d) a package listing Start under
 * `dependencies` instead of `peerDependencies`, installed as a directory of
 * `node_modules` (npm) and (e) in pnpm's store, linked into `node_modules`.
 * Each exports an isomorphic fn and a server
 * fn with a secret, and reads a module the app shares with it. Asserted
 * per environment: the implementation of that environment runs, the ids of
 * one build agree between client and server, the client has no server
 * marker, the shared module initialises once and is one instance, and no
 * module throws while evaluating (TDZ). No pin unless a compiler cause is
 * shown (SPEC §9).
 */
import { describe, expect, test } from 'vitest'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { buildStart } from '../build-start'
import type { StartBundler } from '../build-harness'

const timeout = 60_000

/**
 * The source of a library `tag` importing Start's APIs from `startPackage`:
 * records its own initialisation, reads the shared module, and exports an
 * isomorphic fn, a server fn whose handler reads the library's secret, and
 * the shared module's token.
 */
function libraryModule(tag: string, startPackage: string) {
  return `import { createIsomorphicFn, createServerFn } from '${startPackage}'
import { shared } from 'lib-shared'
import { secret } from './secret.js'
globalThis.__inits_${tag} = (globalThis.__inits_${tag} ?? 0) + 1
export const where = createIsomorphicFn()
  .server(() => 'MARK_${tag}_SERVER')
  .client(() => 'MARK_${tag}_CLIENT')
export const fn = createServerFn().handler(async () => secret())
export const sharedToken = () => shared.token
`
}

/** The files of a library package at `dir` (its `package.json` and modules). */
function library(
  dir: string,
  name: string,
  tag: string,
  options: { peer?: string; dependency?: string; startPackage: string },
) {
  return {
    [`${dir}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: { '.': './index.js' },
      ...(options.peer && { peerDependencies: { [options.peer]: '*' } }),
      ...(options.dependency && {
        dependencies: { [options.dependency]: '*' },
      }),
    }),
    [`${dir}/index.js`]: libraryModule(tag, options.startPackage),
    [`${dir}/secret.js`]: `export const secret = () => 'MARK_${tag}_SECRET'\n`,
  }
}

const files = {
  // The module the app and every library share: one instance per
  // environment.
  'node_modules/lib-shared/package.json': JSON.stringify({
    name: 'lib-shared',
    type: 'module',
    exports: { '.': './index.js' },
  }),
  'node_modules/lib-shared/index.js': `globalThis.__inits_SHARED = (globalThis.__inits_SHARED ?? 0) + 1
export const shared = { token: 'MARK_SHARED_' + Math.random() }
`,
  // (a) peer on start-client-core, framework-agnostic imports.
  ...library('node_modules/lib-peer', 'lib-peer', 'PEER', {
    peer: '@tanstack/start-client-core',
    startPackage: '@tanstack/start-client-core',
  }),
  // (b) no Start peer: the app bundles it explicitly.
  ...library('node_modules/lib-bundled', 'lib-bundled', 'BUNDLED', {
    startPackage: '@tanstack/react-start',
  }),
  // (c) the package of (a), outside node_modules, linked into it.
  ...library('packages/lib-linked', 'lib-linked', 'LINKED', {
    peer: '@tanstack/start-client-core',
    startPackage: '@tanstack/start-client-core',
  }),
  // (d) Start under `dependencies`, installed by npm.
  ...library('node_modules/lib-deps', 'lib-deps', 'DEPS', {
    dependency: '@tanstack/react-start',
    startPackage: '@tanstack/react-start',
  }),
  // (e) the same in pnpm's store, linked into node_modules.
  ...library(
    'node_modules/.pnpm/lib-deps-pnpm@1.0.0/node_modules/lib-deps-pnpm',
    'lib-deps-pnpm',
    'DEPSPNPM',
    {
      dependency: '@tanstack/react-start',
      startPackage: '@tanstack/react-start',
    },
  ),
  'src/app.ts': `import { shared } from 'lib-shared'
import * as peer from 'lib-peer'
import * as bundled from 'lib-bundled'
import * as linked from 'lib-linked'
import * as deps from 'lib-deps'
import * as depsPnpm from 'lib-deps-pnpm'
export const libraries = { peer, bundled, linked, deps, depsPnpm }
export const appToken = () => shared.token
`,
  'src/client-entry.ts': `export { libraries, appToken } from './app'\n`,
  'src/ssr-entry.ts': `export { libraries, appToken } from './app'
${callByIdExports}`,
}

const tags = {
  peer: 'PEER',
  bundled: 'BUNDLED',
  linked: 'LINKED',
  deps: 'DEPS',
  depsPnpm: 'DEPSPNPM',
}

/** How each bundler bundles `lib-bundled` (b) into the server build. */
const bundleExplicitly: Record<
  StartBundler,
  Pick<Parameters<typeof buildStart>[0], 'viteConfig' | 'rsbuildConfig'>
> = {
  vite: {
    viteConfig: {
      environments: { ssr: { resolve: { noExternal: ['lib-bundled'] } } },
    },
  },
  rsbuild: {
    rsbuildConfig: {
      environments: {
        ssr: { source: { include: [/node_modules[\\/]lib-bundled[\\/]/] } },
      },
    },
  },
}

/** What a script of either environment reports about every library. */
const report = `const report = {}
for (const [name, lib] of Object.entries(entry.libraries)) {
  report[name] = {
    where: lib.where(),
    url: lib.fn.url,
    sameShared: lib.sharedToken() === entry.appToken(),
    inits: globalThis['__inits_' + name.toUpperCase()],
  }
}
report.sharedInits = globalThis.__inits_SHARED
`

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a start-client-core peer library, an explicitly bundled library, a symlinked library and libraries with Start under dependencies each run the implementation of each environment, agree on ids and share one module instance',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        // The app depends on the libraries, as an installed one; the peer
        // of (a) and (c) resolves like a dependency pnpm installed for
        // them.
        packageJson: {
          name: 'app',
          private: true,
          type: 'module',
          dependencies: {
            'lib-peer': '*',
            'lib-bundled': '*',
            'lib-linked': '*',
            'lib-deps': '*',
            'lib-deps-pnpm': '*',
          },
        },
        symlinks: {
          ...workspacePackageLinks(['@tanstack/start-client-core']),
          'node_modules/lib-linked': 'packages/lib-linked',
          'node_modules/lib-deps-pnpm':
            'node_modules/.pnpm/lib-deps-pnpm@1.0.0/node_modules/lib-deps-pnpm',
        },
        ...bundleExplicitly[bundler],
      })
      for (const tag of Object.values(tags)) {
        expect(
          {
            server: client.where(`MARK_${tag}_SERVER`),
            secret: client.where(`MARK_${tag}_SECRET`),
          },
          tag,
        ).toEqual({ server: 'nowhere', secret: 'nowhere' })
      }
      const clientRun = (
        await client.run(`${requestsOfPrelude}${report}
report.requests = (await requestsOf(entry.libraries.peer.fn)).length
return report`)
      ).result as Record<string, any>
      const ssrRun = (
        await ssr.run(`${callByIdPrelude}${report}
report.byId = {}
report.called = {}
for (const [name, lib] of Object.entries(entry.libraries)) {
  report.byId[name] = await callById(serverFnId(lib.fn))
  report.called[name] = await lib.fn()
}
return report`)
      ).result as Record<string, any>
      for (const [name, tag] of Object.entries(tags)) {
        expect(clientRun[name], `client ${name}`).toEqual({
          where: `MARK_${tag}_CLIENT`,
          url: expect.any(String),
          sameShared: true,
          inits: 1,
        })
        expect(ssrRun[name], `ssr ${name}`).toEqual({
          where: `MARK_${tag}_SERVER`,
          url: clientRun[name].url,
          sameShared: true,
          // (The SSR caller and provider instances of a server fn module
          // are the regression test "SSR: a server fn module is initialised
          // once ...".)
          inits: expect.any(Number),
        })
        expect(ssrRun.byId[name], `by id ${name}`).toBe(`MARK_${tag}_SECRET`)
        expect(ssrRun.called[name], `ssr call ${name}`).toBe(
          `MARK_${tag}_SECRET`,
        )
      }
      expect(clientRun.sharedInits).toBe(1)
      expect(ssrRun.sharedInits).toBe(1)
      expect(clientRun.requests).toBe(1)
    },
    timeout,
  )
})

// A Start kit as `tsc` emits it, unbundled: its builder in one module, the
// module the app imports adding a validator or middleware to it, which
// names no Start API (`base.validator(…)`, `base.middleware([auth])`, with
// TypeScript's type arguments too). The app finishes the builder: its
// handler stays on the server and the client calls it by its id.
const kitFiles = {
  'node_modules/lib-kit/package.json': JSON.stringify({
    name: 'lib-kit',
    type: 'module',
    peerDependencies: { '@tanstack/react-start': '*' },
    exports: { '.': './index.js', './typed': './typed.ts' },
  }),
  'node_modules/lib-kit/base.js': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn({ method: 'GET' })
`,
  'node_modules/lib-kit/auth.js': `import { createMiddleware } from '@tanstack/react-start'
export const auth = createMiddleware({ type: 'function' }).server(({ next }) => next())
`,
  // (one builder method per module: each must be read on its own)
  'node_modules/lib-kit/validated.js': `import { base } from './base.js'
export const validated = base.validator((data) => data)
`,
  'node_modules/lib-kit/authed.js': `import { base } from './base.js'
import { auth } from './auth.js'
export const authed = base.middleware([auth])
`,
  'node_modules/lib-kit/index.js': `export { validated } from './validated.js'
export { authed } from './authed.js'
`,
  'node_modules/lib-kit/typed.ts': `import { base } from './base.js'
export const typed = base.validator<(data: unknown) => unknown>((data) => data)
`,
  'src/app.ts': `import { authed, validated } from 'lib-kit'
import { typed } from 'lib-kit/typed'
export const fns = {
  validated: validated.handler(async () => 'MARK_KIT_VALIDATED_SECRET'),
  authed: authed.handler(async () => 'MARK_KIT_AUTHED_SECRET'),
  typed: typed.handler(async () => 'MARK_KIT_TYPED_SECRET'),
}
`,
  'src/client-entry.ts': `export { fns } from './app'\n`,
  'src/ssr-entry.ts': `export { fns } from './app'
${callByIdExports}`,
}

describe.each(startBundlers)(
  '%s build of a two-module Start kit',
  (bundler) => {
    test(
      "the app's handlers on the kit's builders stay on the server, and the client calls them by id",
      async () => {
        const { client, ssr } = await buildStart({
          bundler,
          files: kitFiles,
          entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
          packageJson: {
            name: 'app',
            private: true,
            type: 'module',
            dependencies: { 'lib-kit': '*' },
          },
        })
        const names = ['validated', 'authed', 'typed']
        for (const name of names) {
          expect(
            client.where(`MARK_KIT_${name.toUpperCase()}_SECRET`),
            name,
          ).toBe('nowhere')
        }
        const urls = (
          await client.run(
            `return Object.fromEntries(Object.entries(entry.fns).map(([name, fn]) => [name, fn.url]))`,
          )
        ).result as Record<string, unknown>
        const called = (
          await ssr.run(`${callByIdPrelude}const called = {}
for (const [name, url] of Object.entries(${JSON.stringify(urls)})) {
  called[name] = await callById(serverFnId(url))
}
return called`)
        ).result
        expect(called).toEqual(
          Object.fromEntries(
            names.map((name) => [
              name,
              `MARK_KIT_${name.toUpperCase()}_SECRET`,
            ]),
          ),
        )
      },
      timeout,
    )

    // `.inputValidator()` was renamed `.validator()`: a kit module still
    // calling it is read, and the client build fails at its call, naming
    // the dependency to update (the app's handler shipped otherwise).
    test(
      'a kit module calling the removed .inputValidator() fails the client build at the call',
      async () => {
        const legacy = `import { base } from './base.js'
export const legacy = base.inputValidator((data) => data)
`
        const error: unknown = await buildStart({
          bundler,
          files: {
            'node_modules/lib-kit/package.json':
              kitFiles['node_modules/lib-kit/package.json'],
            'node_modules/lib-kit/base.js':
              kitFiles['node_modules/lib-kit/base.js'],
            'node_modules/lib-kit/index.js': legacy,
            'src/app.ts': `import { legacy } from 'lib-kit'
export const fn = legacy.handler(async () => 'MARK_KIT_LEGACY_SECRET')
`,
            'src/client-entry.ts': `export { fn } from './app'\n`,
          },
          entry: 'src/client-entry.ts',
          packageJson: {
            name: 'app',
            private: true,
            type: 'module',
            dependencies: { 'lib-kit': '*' },
          },
        }).then(
          (build) =>
            expect.fail(
              `the build succeeded; the handler's text is ${build.client.where('MARK_KIT_LEGACY_SECRET')} in the client bundle`,
            ),
          (e: unknown) => e,
        )
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        expectDiagnostic(error.diagnostics, {
          severity: 'error',
          file: 'node_modules/lib-kit/index.js',
          root: error.root,
          position: diagnosticPosition(legacy, 'inputValidator'),
        })
      },
      timeout,
    )
  },
)
