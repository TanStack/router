/**
 * Import protection's default rules and its pattern matching, on a real
 * app (Vite dev server with Start's whole public plugin, mock mode): what a
 * user gets with no `importProtection` option (SPEC J6.1, J6.10; the guide's
 * options table), and how a configured glob or RegExp matches (J6.1,
 * J6.11). Read from what the dev server reports (`locatedImporters`: the
 * reported importer, at a relevant original place), in each environment.
 *
 * - The client denies the server entry of every Start framework
 *   (`@tanstack/{react,solid,vue}-start/server`) and every module marked
 *   server-only by any framework's marker; the server denies modules marked
 *   client-only by any framework's marker, and no specifier by default.
 * - Files under `node_modules` skip the file-pattern checks by default in
 *   both environments (`excludeFiles: ['**\/node_modules/**']`).
 *
 * The framework packages other than React are stand-ins in the app's
 * `node_modules` (this app is a React app): the rules name them by
 * specifier, so the app needs only modules for them to resolve to.
 *
 * Replaces the internal controls of the default rule lists and of the
 * matcher (`outside-compiler-corpus/importProtection/defaults.test.ts`,
 * `matchers.test.ts`), which read today's rule objects.
 */
import { describe, expect, test } from 'vitest'
import {
  locatedImporters,
  startProtectedDevServer,
} from '../../importProtection/start-apps'

const timeout = 30_000

/** A stand-in package `name` whose subpath modules each export `value`. */
function standInPackage(name: string, subpaths: Array<string>) {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: Object.fromEntries(
        subpaths.map((subpath) => [`./${subpath}`, `./${subpath}.js`]),
      ),
    }),
    ...Object.fromEntries(
      subpaths.map((subpath) => [
        `node_modules/${name}/${subpath}.js`,
        `export const value = () => 'REAL_${name}/${subpath}'\n`,
      ]),
    ),
  }
}

/** A package `name` whose entry is `index.js`, with other files. */
function plainPackage(name: string, files: Record<string, string>) {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: './index.js',
    }),
    ...Object.fromEntries(
      Object.entries(files).map(([file, code]) => [
        `node_modules/${name}/${file}`,
        code,
      ]),
    ),
  }
}

/**
 * Asserts that the reports of `environment` (`located`, from
 * `locatedImporters`) are exactly the `expected` violations, each reported
 * (at least once) at one of its relevant files: the importer, or for a
 * marker violation the marked module (audit F ASK-1).
 */
function expectReported(
  located: Array<string>,
  environment: 'client' | 'server',
  expected: Record<string, Array<string>>,
) {
  const files = [
    ...new Set(
      located
        .filter((entry) => entry.startsWith(`${environment} `))
        .map((entry) => entry.slice(environment.length + 1)),
    ),
  ]
  const unexpected = files.filter(
    (file) => !Object.values(expected).some((places) => places.includes(file)),
  )
  const missing = Object.entries(expected)
    .filter(([, places]) => !places.some((place) => files.includes(place)))
    .map(([name]) => name)
  expect({ unexpected, missing }).toEqual({ unexpected: [], missing: [] })
}

describe('the default rules', () => {
  const files = {
    ...standInPackage('@tanstack/solid-start', [
      'server',
      'server-only',
      'client-only',
    ]),
    ...standInPackage('@tanstack/vue-start', [
      'server',
      'server-only',
      'client-only',
    ]),
    // A dependency whose own files are named like denied files: excluded by
    // default in both environments
    ...plainPackage('dep-pkg', {
      'index.js': `export { secret } from './db.server.js'
export { widget } from './widget.client.js'
`,
      'db.server.js': `export const secret = () => 'REAL_DEP_SERVER'\n`,
      'widget.client.js': `export const widget = () => 'REAL_DEP_CLIENT'\n`,
    }),
    // Server entries of each framework (denied to the client by specifier)
    'src/uses/react-server.ts': `import { getRequest } from '@tanstack/react-start/server'
export const reactServer = () => getRequest()
`,
    'src/uses/solid-server.ts': `import { value } from '@tanstack/solid-start/server'
export const solidServer = () => value()
`,
    'src/uses/vue-server.ts': `import { value } from '@tanstack/vue-start/server'
export const vueServer = () => value()
`,
    // Modules marked server-only by each framework's marker
    'src/solid-marked.ts': `import '@tanstack/solid-start/server-only'
export const solidMarked = () => 'MARK_SOLID_SERVER_ONLY'
`,
    'src/vue-marked.ts': `import '@tanstack/vue-start/server-only'
export const vueMarked = () => 'MARK_VUE_SERVER_ONLY'
`,
    'src/uses/solid-marked.ts': `import { solidMarked } from '../solid-marked'
export const useSolidMarked = () => solidMarked()
`,
    'src/uses/vue-marked.ts': `import { vueMarked } from '../vue-marked'
export const useVueMarked = () => vueMarked()
`,
    // Modules marked client-only by each framework's marker
    'src/solid-client-marked.ts': `import '@tanstack/solid-start/client-only'
export const solidClient = () => 'MARK_SOLID_CLIENT_ONLY'
`,
    'src/vue-client-marked.ts': `import '@tanstack/vue-start/client-only'
export const vueClient = () => 'MARK_VUE_CLIENT_ONLY'
`,
    'src/uses/solid-client-marked.ts': `import { solidClient } from '../solid-client-marked'
export const useSolidClient = () => solidClient()
`,
    'src/uses/vue-client-marked.ts': `import { vueClient } from '../vue-client-marked'
export const useVueClient = () => vueClient()
`,
    'src/uses/dep.ts': `import { secret, widget } from 'dep-pkg'
export const useDep = () => [secret(), widget()]
`,
    'src/entry.ts': `export * from './uses/react-server'
export * from './uses/solid-server'
export * from './uses/vue-server'
export * from './uses/solid-marked'
export * from './uses/vue-marked'
export * from './uses/solid-client-marked'
export * from './uses/vue-client-marked'
export * from './uses/dep'
`,
  }

  let located: Promise<Array<string>> | undefined
  /** The reports of both environments loading the app, read once. */
  const reports = () =>
    (located ??= (async () => {
      const server = await startProtectedDevServer(files, {
        mockAccess: 'off',
      })
      // The client loads the app the way a browser does; the server runs it
      await server.load('/src/entry.ts', {
        skip: /(?:^|\/)node_modules\/|^node:|^\/@vite\//,
      })
      await server.import('/src/entry.ts', 'ssr')
      return locatedImporters(server.logs, files)
    })())

  test(
    "the client denies every framework's server entry and server-only marker, not the files of a dependency",
    async () => {
      expectReported(await reports(), 'client', {
        'react server entry': ['src/uses/react-server.ts'],
        'solid server entry': ['src/uses/solid-server.ts'],
        'vue server entry': ['src/uses/vue-server.ts'],
        'solid server-only marker': [
          'src/uses/solid-marked.ts',
          'src/solid-marked.ts',
        ],
        'vue server-only marker': [
          'src/uses/vue-marked.ts',
          'src/vue-marked.ts',
        ],
      })
    },
    timeout,
  )

  test(
    "the server denies every framework's client-only marker, no specifier, and not the files of a dependency",
    async () => {
      expectReported(await reports(), 'server', {
        'solid client-only marker': [
          'src/uses/solid-client-marked.ts',
          'src/solid-client-marked.ts',
        ],
        'vue client-only marker': [
          'src/uses/vue-client-marked.ts',
          'src/vue-client-marked.ts',
        ],
      })
    },
    timeout,
  )
})

describe('configured patterns', () => {
  const files = {
    ...plainPackage('pg', {
      'index.js': `export default () => 'REAL_pg'\n`,
    }),
    ...plainPackage('pg-pool', {
      'index.js': `export default () => 'REAL_pg-pool'\n`,
    }),
    'src/.server/db.ts': `export const db = () => 'MARK_DEEP_SERVER'\n`,
    'src/.client/ui.ts': `export const ui = () => 'MARK_DEEP_CLIENT'\n`,
    'src/uses/deep-server.ts': `import { db } from '../.server/db'
export const useDeepServer = () => db()
`,
    'src/uses/deep-client.ts': `import { ui } from '../.client/ui'
export const useDeepClient = () => ui()
`,
    'src/uses/postgres.ts': `import pg from 'pg'
export const usePg = () => pg()
`,
    'src/uses/pg-pool.ts': `import pool from 'pg-pool'
export const usePool = () => pool()
`,
    'src/entry.ts': `export * from './uses/deep-server'
export * from './uses/deep-client'
export * from './uses/postgres'
export * from './uses/pg-pool'
`,
  }

  test(
    'a ** glob matches files at any depth under a directory, and an anchored RegExp only the exact specifier',
    async () => {
      const server = await startProtectedDevServer(files, {
        client: { files: ['**/.server/**'], specifiers: [/^pg$/] },
        mockAccess: 'off',
      })
      await server.load('/src/entry.ts')
      expectReported(locatedImporters(server.logs, files), 'client', {
        'the deep glob': ['src/uses/deep-server.ts'],
        'the anchored RegExp': ['src/uses/postgres.ts'],
      })
    },
    timeout,
  )
})
