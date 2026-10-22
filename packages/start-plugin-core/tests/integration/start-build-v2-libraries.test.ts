/**
 * Libraries written with Start APIs (uncompiled source) in real production
 * builds through Start's Vite and Rsbuild plugins (build-harness.ts), SPEC
 * J4.16, G11, J4.3: (a) a package whose only Start peer is
 * `@tanstack/start-client-core`, importing its APIs from there; (b) a
 * package without a Start peer, which the user bundles explicitly (Vite
 * `noExternal`, Rsbuild `source.include`); (d) the package of (a) linked
 * into `node_modules` by a real symlink from a directory outside it
 * (pnpm-style, #8139 as quoted). Each exports an isomorphic fn and a server
 * fn with a secret, and reads a module the app shares with it. Asserted
 * per environment: the implementation of that environment runs, the ids of
 * one build agree between client and server, the client has no server
 * marker, the shared module initialises once and is one instance, and no
 * module throws while evaluating (TDZ). No pin unless a compiler cause is
 * shown (SPEC §9).
 * Source: FIX-PLAN V2-12 rows a, b, d (start-fable ISO-5/LIB-2, Sol T08;
 * 222 library repos).
 */
import { describe, expect, test } from 'vitest'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
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
  options: { peer?: string; startPackage: string },
) {
  return {
    [`${dir}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: { '.': './index.js' },
      ...(options.peer && { peerDependencies: { [options.peer]: '*' } }),
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
  // (d) the package of (a), outside node_modules, linked into it.
  ...library('packages/lib-linked', 'lib-linked', 'LINKED', {
    peer: '@tanstack/start-client-core',
    startPackage: '@tanstack/start-client-core',
  }),
  'src/app.ts': `import { shared } from 'lib-shared'
import * as peer from 'lib-peer'
import * as bundled from 'lib-bundled'
import * as linked from 'lib-linked'
export const libraries = { peer, bundled, linked }
export const appToken = () => shared.token
`,
  'src/client-entry.ts': `export { libraries, appToken } from './app'\n`,
  'src/ssr-entry.ts': `export { libraries, appToken } from './app'
${callByIdExports}`,
}

const tags = { peer: 'PEER', bundled: 'BUNDLED', linked: 'LINKED' }

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
    'a start-client-core peer library, an explicitly bundled library and a symlinked library each run the implementation of each environment, agree on ids and share one module instance',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        // The app depends on the libraries, as an installed one; the peer
        // of (a) and (d) resolves like a dependency pnpm installed for
        // them.
        packageJson: {
          name: 'app',
          private: true,
          type: 'module',
          dependencies: {
            'lib-peer': '*',
            'lib-bundled': '*',
            'lib-linked': '*',
          },
        },
        symlinks: {
          ...workspacePackageLinks(['@tanstack/start-client-core']),
          'node_modules/lib-linked': 'packages/lib-linked',
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
          // are the known-bugs pin "SSR: a server fn module is initialised
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
