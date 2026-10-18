// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../../importProtection/known-bugs.test.ts (fast tier).
/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed. A mock
 * is told by what it does (`mock-helpers.ts`, `describeValue`: `a safe
 * mock`), and a report by its sections (`violation-report.ts`).
 */
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  runRsbuildClient,
  startRsbuildDevServer,
} from '../../rsbuild-dev-server'
import {
  describeValue,
  describeValuePrelude,
} from '../../importProtection/mock-helpers'
import {
  factoryTopLevelCall,
  rejection,
  reportedViolations,
  serverFnFactoryApp,
  startProtectedDevServer,
} from '../../importProtection/start-apps'
import type { RsbuildConfig } from '@rsbuild/core'
import type { StartBuild } from '../../build-harness'
import type { ImportProtectionOptions } from '../../../src/schema'

/**
 * Start's import protection options of a build that denies `files` to the
 * client and fails on a violation.
 */
function denyToClient(files: Array<string>) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

/** Same as `denyToClient`, mocking the denied modules instead. */
function mockToClient(files: Array<string>) {
  return { importProtection: { behavior: 'mock', client: { files } } } as const
}

/** A denied module whose code marks the bundle it is in. */
const corpusModule = `export const corpus = () => 'MARK_CORPUS' + Math.random()\n`

/**
 * A client entry re-exporting a server fn of `layout.ts`, which also
 * exports a function using the denied-to-be `corpus.ts` that nothing calls.
 * Import protection checks the modules of the source directory (`src`).
 */
const droppedCorpusFiles = {
  'src/corpus.ts': corpusModule,
  'src/layout.ts': `import { createServerFn } from '@tanstack/react-start'
import { corpus } from './corpus'
export const size = () => corpus()
export const nav = createServerFn().handler(async () => 1)
`,
  'src/entry.ts': `export { nav } from './layout'\n`,
}

/** The code of every chunk of a build's client bundle, by file name. */
const clientChunks = ({ client }: StartBuild) =>
  Object.fromEntries(
    client.chunks.map(({ fileName, code }) => [fileName, code]),
  )

describe.each(startBundlers)('%s build', (bundler) => {
  // Control for the pin below (same harness): a denied module whose code the
  // client bundle contains fails the build.
  test('a denied module the client uses fails the build', async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          'src/corpus.ts': corpusModule,
          'src/entry.ts': `import { corpus } from './corpus'\nexport const read = () => corpus()\n`,
        },
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      }),
    )
    expect(
      reportedViolations(error.message).map(({ environment }) => environment),
    ).toEqual(['client'])
  }, 60_000)

  // Control for the pin below (same files, no import protection): the client
  // bundle does not contain the module's code.
  test('without import protection, the client bundle drops the unused module', async () => {
    const { client } = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: { importProtection: { enabled: false } },
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  }, 60_000)

  // Control for the pins below (same harness and files, import protection
  // on): the build succeeds in mock mode, without the module's code.
  test('in mock mode, the client bundle drops the unused module', async () => {
    const { client } = await buildStart({
      bundler,
      files: droppedCorpusFiles,
      entry: 'src/entry.ts',
      start: mockToClient(['**/corpus.ts']),
    })
    expect(client.where('MARK_CORPUS')).toBe('nowhere')
  }, 60_000)

  // Bug: the build check counts a denied module as surviving when the
  // compilation contains it, whether or not the client uses it. Vite: the
  // mock that replaces the module is never tree-shaken, because its exports
  // read members of the mock (`export const corpus = mock.corpus`,
  // import-protection/virtualModules.ts), which the bundler keeps (with
  // side-effect-free exports, a scratch run passes this pin on Vite).
  // Rsbuild: the report step walks every module of the module graph
  // (connections are not filtered by whether they are used,
  // INTERNALS-import-protection.md).
  // Impact: a denied module that a client-reachable module imports, but that
  // the client never uses, still fails the build.
  // Source: issue #8101 (closed without a reproduction); gap IP6b
  // (gaps/start-env.md).
  test.fails(
    'a denied module the client bundle drops does not fail the build',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: droppedCorpusFiles,
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      })
      expect(client.where('MARK_CORPUS')).toBe('nowhere')
    },
    60_000,
  )

  // Bug: same as above, in mock mode: the mock of a denied module the client
  // never uses stays in the client bundle, and the build warns about it.
  // The mock module is marked side-effect free (`@__NO_SIDE_EFFECTS__`,
  // `@__PURE__`), but its exports read members of the mock.
  // Impact: mock-mode builds ship mock code (a Proxy runtime) for unused
  // imports, and report violations the client never reaches.
  // Source: weak check virtualModules.test.ts "returns mock code" (asserted
  // the purity annotations as text), oracle-gaps REPORT.md "Weak checks".
  // The client bundle is compared with the one import protection disabled
  // gives (the control above): with nothing left of the unused edge, the
  // two are the same.
  test.fails(
    'in mock mode, an unused denied module leaves nothing in the client bundle and no warning',
    async () => {
      const build = (start: Parameters<typeof buildStart>[0]['start']) =>
        buildStart({
          bundler,
          files: droppedCorpusFiles,
          entry: 'src/entry.ts',
          start,
        })
      // (one build at a time: a Vite build runs in its app's directory)
      const mocked = await build(mockToClient(['**/corpus.ts']))
      const disabled = await build({ importProtection: { enabled: false } })
      expect({
        chunks: clientChunks(mocked),
        warnings: reportedViolations(mocked.client.warnings),
      }).toEqual({ chunks: clientChunks(disabled), warnings: [] })
    },
    60_000,
  )
})

describe('Vite dev, behavior "error"', () => {
  /**
   * `serverFnFactoryApp` with a top-level call of the denied `getRequest()`
   * in `module` (the server fn factory module or another one), without the
   * leak (behavior "error" stops at the first violation).
   */
  const topLevelCallApp = (module: 'src/factory.ts' | 'src/other.ts') => {
    const app: Record<string, string> = {
      ...serverFnFactoryApp(
        module === 'src/factory.ts' ? factoryTopLevelCall : '',
      ),
      'src/entry.ts': `export { fn } from './usage'\nexport * from './other'\n`,
      'src/other.ts':
        module === 'src/other.ts'
          ? `import { getRequest } from '@tanstack/react-start/server'\n${factoryTopLevelCall}`
          : `export const other = 1\n`,
    }
    delete app['src/leak.ts']
    return app
  }

  /**
   * The violations loading the app's modules reports, or `'loaded'`. (Not
   * the modules of `@tanstack/react-start/server`, which imports Start's
   * entries, which only Start's whole plugin provides.)
   */
  async function loadOutcome(files: Record<string, string>) {
    const server = await startProtectedDevServer(files, { behavior: 'error' })
    return server.load('/src/entry.ts', { skip: /^\/@(vite|fs)\// }).then(
      () => 'loaded',
      (error: Error) =>
        reportedViolations(error.message).map(
          ({ environment, importer }) =>
            `${environment} ${importer.replace(/:.*/, '')}`,
        ),
    )
  }

  // Control for the pin below (same harness): a top-level call of a denied
  // specifier in a module the Start compiler did not look up fails to load.
  test('a module calling a denied import at the top level fails to load', async () => {
    expect(await loadOutcome(topLevelCallApp('src/other.ts'))).toEqual([
      'client src/other.ts',
    ])
  }, 30_000)

  // Bug: the Start compiler resolves the imports of a server fn factory
  // module with a lookup query (`SERVER_FN_LOOKUP`), and import protection
  // records the module as a lookup module by its path without the query
  // (`serverFnLookupModules`, vite/import-protection-plugin/plugin.ts
  // `resolveId`). The client's own transform of the module then counts as a
  // lookup too, whose violations behavior "error" silences in dev (no later
  // verification).
  // Impact: in dev with behavior "error", the client of a server fn factory
  // module that calls a denied import (here `getRequest()` of
  // `@tanstack/react-start/server`) at the top level gets the real module,
  // without any error; in mock mode the same module is mocked and logged
  // (dev.test.ts "a server fn factory module that also calls a denied import
  // at the top level is logged").
  // Source: mutation run R3, ip-vite B3 (REPORT §6 #4).
  test.fails(
    'a server fn factory module calling a denied import at the top level fails to load',
    async () => {
      expect(await loadOutcome(topLevelCallApp('src/factory.ts'))).toEqual([
        'client src/factory.ts',
      ])
    },
    30_000,
  )

  // Bug: same cause as the pin above, one module further: when the Start
  // compiler's lookup of a server fn factory module resolves the module's
  // imports, import protection records each imported module as a lookup
  // module too (vite/import-protection-plugin/plugin.ts `resolveId`,
  // "Propagate pre-transform status transitively"), by its path, so the
  // client's own transform of that module is silenced as well.
  // Impact: in dev with behavior "error", any module a server fn factory
  // module imports gets the real denied module when it calls it at the top
  // level, without any error (the control above fails to load).
  // Source: mutation run R4 (spc:5168, 5169).
  test.fails(
    'a module a server fn factory module imports, calling a denied import at the top level, fails to load',
    async () => {
      const app = topLevelCallApp('src/other.ts')
      app['src/factory.ts'] += `export { request } from './other'\n`
      app['src/entry.ts'] = `export { fn } from './usage'\n`
      expect(await loadOutcome(app)).toEqual(['client src/other.ts'])
    },
    30_000,
  )
})

describe('Rsbuild dev', () => {
  /**
   * Only a guard against a compile that never comes, never shorter than the
   * test's timeout (rsbuild/import-protection.test.ts).
   */
  const timeout = 60_000
  const compileTimeout = timeout

  /** A module type another loader compiles to JS (a stand-in for `.mdx`). */
  const pageModules: RsbuildConfig = {
    tools: {
      rspack: {
        module: { rules: [{ test: /\.page$/, type: 'javascript/auto' }] },
      },
    },
  }

  // Control for the pins below (same config and import protection): a
  // module of that type is compiled, and its code runs in the client.
  test('a module of another type without a denied import runs in the client', async () => {
    const server = await startRsbuildDevServer({
      compileTimeout,
      importProtection: {
        behavior: 'error',
        client: { specifiers: ['db-lib'] },
      },
      config: pageModules,
      files: {
        'src/home.page': `export const page = () => 'MARK_PAGE'\n`,
        'src/entry.ts': `import { page } from './home.page'\nconsole.log(page())\n`,
      },
    })
    expect(server.errors).toEqual([])
    expect(await runRsbuildClient(server)).toEqual(['MARK_PAGE'])
  }, timeout)

  // Bug: Rsbuild import protection checks importers by file extension
  // (`isImportProtectionSourceFile`, rsbuild/import-protection.ts, only
  // JS/TS extensions), and its loader rule only rewrites those files, so an
  // importer of another module type that compiles to JS (e.g. `.mdx`) is
  // never checked: a denied file is mocked (the file rule) but not reported,
  // and a denied specifier is neither reported nor mocked.
  // Impact: behavior "error" does not fail for denied imports of such
  // modules, and the real code of a denied specifier runs on the client.
  // Source: mutation run R3, ip-rsbuild R2 (REPORT §6 #2); the JS/TS
  // extensions are covered by rsbuild/import-protection.test.ts "is reported
  // when it is a .$extension file".
  test.fails.each<{ name: string; files: Record<string, string> }>([
    {
      name: 'a denied file',
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/home.page': `import { secret } from './secret.server'\nexport const page = () => secret()\n`,
      },
    },
    {
      name: 'a denied specifier',
      files: {
        'node_modules/db-lib/package.json': JSON.stringify({
          name: 'db-lib',
          type: 'module',
          exports: { '.': './index.js' },
        }),
        'node_modules/db-lib/index.js': `export const secret = () => 'MARK_LIB'\n`,
        'src/home.page': `import { secret } from 'db-lib'\nexport const page = () => secret()\n`,
      },
    },
  ])(
    'a module of another type importing $name is reported, and its real code does not run',
    async ({ files }) => {
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: {
          behavior: 'error',
          client: { specifiers: ['db-lib'] },
        },
        config: pageModules,
        files: {
          ...files,
          'src/entry.ts': `import { page } from './home.page'\nconsole.log(page())\n`,
        },
      })
      const messages = await runRsbuildClient(server)
      expect({
        reported: reportedViolations(server.errors).map(
          ({ environment, importer }) =>
            `${environment} ${importer.replace(/:.*/, '')}`,
        ),
        ranRealCode: messages.some((message) => message.includes('MARK_')),
      }).toEqual({ reported: ['client src/home.page'], ranRealCode: false })
    },
    timeout,
  )

  // In Rsbuild dev, an error thrown by `onViolation` (awaited in the
  // `processAssets` hook, rsbuild/import-protection.ts `reportViolation`)
  // fails the compile: Rspack gives up on it (`compiler.hooks.failed`, no
  // `done`) and Rsbuild logs the error, like a build fails with it.
  // Source: mutation run R3, ip-rsbuild (REPORT §6 #23). This was a pin
  // ("never reported") while the dev harness only waited for `done`; the
  // harness now fails the compile wait with the error Rspack reports
  // (mutation run R3c).
  test('an onViolation that throws ends the compile with its error', async () => {
    const outcome = await startRsbuildDevServer({
      importProtection: {
        onViolation: () => {
          throw new Error('MARK_THROWN')
        },
      },
      // Only a guard: the failed compile ends the wait.
      compileTimeout,
      files: {
        'src/secret.server.ts': `export const secret = () => 'secret'\n`,
        'src/entry.ts': `import { secret } from './secret.server'\nconsole.log(secret())\n`,
      },
    }).then(
      (server) => server.errors.join('\n'),
      (error: Error) => error.message,
    )
    expect(outcome).toContain('MARK_THROWN')
  }, timeout)
})

describe.each(startBundlers)('%s build', (bundler) => {
  // Bug (Rsbuild): a dynamic `import('db-lib')` of a denied specifier is
  // neither reported nor mocked: the Rsbuild loader only rewrites static
  // imports and re-exports (`rewriteDeniedImports`,
  // import-protection/rewrite.ts), and the build reports specifier
  // violations only through the mock modules of rewritten imports
  // (`processAssets` in rsbuild/import-protection.ts). Vite fails the build.
  // Impact: the real module ships to the client in a lazy chunk and runs
  // there, without any error or warning.
  // Source: round 3 mutation testing (ip-misc P1).
  const dynamicImportTest = bundler === 'rsbuild' ? test.fails : test
  dynamicImportTest(
    'a client dynamic import of a denied specifier fails the build, reporting one client violation',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'node_modules/db-lib/package.json': JSON.stringify({
              name: 'db-lib',
              type: 'module',
              exports: { '.': './index.js' },
            }),
            'node_modules/db-lib/index.js': `export const secret = () => 'MARK_SECRET'\n`,
            'src/entry.ts': `export const read = () => import('db-lib').then((m) => m.secret())\n`,
          },
          entry: 'src/entry.ts',
          start: { importProtection: { client: { specifiers: ['db-lib'] } } },
        }),
      )
      expect(
        reportedViolations(error.message).map(({ environment }) => environment),
      ).toEqual(['client'])
    },
    60_000,
  )

  /**
   * What the client gets in a mock-mode build of an entry that imports
   * `secret` from the denied `file` (control: the mock-mode rows of
   * build.test.ts, same harness).
   */
  async function mockModeOutcome(
    file: string,
    code: string,
    importStatement: string,
  ) {
    const { client } = await buildStart({
      bundler,
      files: {
        [`src/${file}`]: code,
        'src/entry.ts': `${importStatement}
export const read = () => secret
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
    })
    return {
      warned: reportedViolations(client.warnings).length > 0,
      hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
      read: (
        await client.run(`${describeValuePrelude}
return describeValue(entry.read(), 'MARK_SECRET')`)
      ).result,
    }
  }

  // Bug: in mock mode, a denied file that is not JavaScript or TypeScript
  // keeps its content: Vite replaces a denied file with its mock in a
  // transform hook whose filter only lets JS/TS modules through
  // (`/\.[cm]?[tj]sx?($|\?)/`, transform-cache plugin of
  // vite/import-protection-plugin/plugin.ts), and the Rsbuild loader rule
  // only applies to JS/TS modules (`test: /\.[cm]?[tj]sx?$/`,
  // rsbuild/import-protection.ts). Both warn.
  // Impact: a mock-mode build ships the real content of a denied
  // `*.server.json` (e.g. server configuration or credentials) to the client.
  // Source: round 3 mutation testing (ip-vite B1).
  test.fails(
    'in mock mode, a denied .server.json file is mocked, with a warning',
    async () => {
      expect(
        await mockModeOutcome(
          'secret.server.json',
          `{ "secret": "MARK_SECRET" }\n`,
          `import data from './secret.server.json'
const secret = data.secret`,
        ),
      ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
    },
    60_000,
  )

  // Bug: in mock mode, a denied CommonJS file (`.server.cjs`) fails the
  // build: the mock that replaces the file is an ES module, which Vite's
  // parser rejects in a `.cjs` file (`export default mock`), and whose named
  // exports are the ES exports of the denied file, which a CommonJS file has
  // none of, so Rspack cannot link the named import (`export 'secret' ...
  // was not found`). With import protection off, both build the named
  // import of the real module.
  // Impact: a mock-mode build of a project with a `*.server.cjs` the client
  // imports fails instead of mocking it.
  // Source: round 3 mutation testing (ip-vite B1).
  test.fails(
    'in mock mode, a denied .server.cjs file is mocked, with a warning',
    async () => {
      expect(
        await mockModeOutcome(
          'secret.server.cjs',
          `exports.secret = () => 'MARK_SECRET'\n`,
          `import { secret } from './secret.server.cjs'`,
        ),
      ).toEqual({ warned: true, hasRealCode: false, read: 'a safe mock' })
    },
    60_000,
  )
})

/**
 * App-level twins of the pins on internal functions (the rewrite and the
 * mock modules): a real app with each input, on a Vite dev server (mock
 * mode, the dev default) and in mock-mode builds. `src/entry.ts` exports
 * `read()`, which returns what the app gets from its denied import, as an
 * array of values; each must be a safe mock (`a safe mock`) unless a row
 * expects a real value, and the app must load or build.
 * Source: audit F, missing coverage 1; V1 ip S13 (computed keys), S25.
 */
describe('app-level twins of the mock pins', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A dependency `name` exporting `query` and `epsilon`, denied by `client.specifiers`. */
  const deniedDependency = (name: string) => ({
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: { '.': './index.js' },
    }),
    [`node_modules/${name}/index.js`]: `export const query = () => 'MARK_SECRET'
export const epsilon = () => ({ deep: () => 'MARK_SECRET' })
`,
  })

  const mock = 'a safe mock'

  interface TwinCase {
    files: Record<string, string>
    importProtection?: ImportProtectionOptions
    /** What `entry.read()` gives, described (default: one safe mock). */
    expected?: Array<string>
  }

  const twins: Record<string, TwinCase> = {
    // Twin of the rewrite pin "a denied namespace re-export keeps its
    // exported name" (known-bugs.test.ts, fast tier, until W2-i).
    'a module re-exporting a denied file as a namespace': {
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/barrel.ts': `export * as secrets from './secret.server'\n`,
        'src/entry.ts': `import { secrets } from './barrel'
export const read = () => [secrets.secret()]
`,
      },
    },
    // Twin of "a namespace re-export" (the mock of a denied file).
    'a denied file re-exporting a namespace': {
      files: {
        'src/helpers.ts': `export const format = () => 'MARK_SECRET'\n`,
        'src/lib.server.ts': `export * as helpers from './helpers'\n`,
        'src/entry.ts': `import { helpers } from './lib.server'
export const read = () => [helpers.format()]
`,
      },
    },
    // Twin of "the mock of a denied file exporting `delete` exports it" and
    // "a denied import used as `api.delete()` evaluates to a mock".
    'a denied file exporting `delete`, used as `api.delete()`': {
      files: {
        'src/api.server.ts': `const remove = () => 'MARK_SECRET'
export { remove as delete }
`,
        'src/entry.ts': `import * as api from './api.server'
export const read = () => [api.delete()]
`,
      },
    },
    // Same bug, the other names a module cannot bind.
    'a denied file exporting `eval` and `arguments`': {
      files: {
        'src/api.server.ts': `const a = () => 'MARK_SECRET'
const b = () => 'MARK_SECRET'
export { a as eval, b as arguments }
`,
        'src/entry.ts': `import * as api from './api.server'
export const read = () => [api.eval(), api.arguments()]
`,
      },
      expected: [mock, mock],
    },
    // Twin of "a JSX pragma that leads a denied import stays in effect": the
    // page renders with the runtime its pragma names (a custom JSX runtime
    // is valid user input).
    'a JSX pragma leading a denied import': {
      files: {
        'node_modules/custom-jsx/package.json': JSON.stringify({
          name: 'custom-jsx',
          type: 'module',
          exports: {
            './jsx-runtime': './jsx-runtime.js',
            './jsx-dev-runtime': './jsx-runtime.js',
          },
        }),
        'node_modules/custom-jsx/jsx-runtime.js': `export const Fragment = Symbol('Fragment')
export const jsx = () => 'MARK_CUSTOM_JSX'
export const jsxs = jsx
export const jsxDEV = jsx
`,
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/page.tsx': `/** @jsxImportSource custom-jsx */
import { secret } from './secret.server'
export const Page = () => <div>{String(secret())}</div>
`,
        'src/entry.ts': `import { Page } from './page'
export const read = () => [Page()]
`,
      },
      expected: ['MARK_CUSTOM_JSX'],
    },
    // Twin of "a namespace member read before the import".
    'a namespace member read in a function declared before the import': {
      files: {
        ...deniedDependency('db-lib'),
        'src/entry.ts': `export function read() {
  return [db.query()]
}
import * as db from 'db-lib'
`,
      },
      importProtection: { client: { specifiers: ['db-lib'] } },
    },
    // A namespace member read with a computed key (SPEC J6.8, `ns[key]`):
    // the key names a real export of the denied file, and a deeper member
    // of what it gives.
    'a namespace member read with a computed key, of a denied file': {
      files: {
        'src/model.server.ts': `export const epsilon = () => ({ deep: () => 'MARK_SECRET' })\n`,
        'src/entry.ts': `import * as ns from './model.server'
const key = 'epsilon'
export const read = () => [ns[key](), ns[key]().deep()]
`,
      },
      expected: [mock, mock],
    },
    'a namespace member read with a computed key, of a denied specifier': {
      files: {
        ...deniedDependency('db-lib'),
        'src/entry.ts': `import * as ns from 'db-lib'
const key = 'epsilon'
export const read = () => [ns[key](), ns[key]().deep()]
`,
      },
      importProtection: { client: { specifiers: ['db-lib'] } },
      expected: [mock, mock],
    },
    // Twin of "an enum and a namespace" (the mock of a denied file).
    'a denied file exporting an enum and a namespace': {
      files: {
        'src/model.server.ts': `export enum Color {
  Red = 'MARK_SECRET',
}
export namespace Util {
  export const x = 'MARK_SECRET'
}
`,
        'src/entry.ts': `import { Color, Util } from './model.server'
export const read = () => [Color.Red, Util.x]
`,
      },
      expected: [mock, mock],
    },
  }

  /**
   * The channels on which main fails each twin (`.fails`, red reason in
   * brackets). The JSX pragma twin passes everywhere: with the default JSX
   * pipeline, JSX is compiled before import protection rewrites the import
   * (the internal pin needs a JSX plugin that runs after the rewrite).
   */
  const failsOn: Record<string, Array<string>> = {
    // Bug: the dev rewrite of the importer drops `export * as ns` (the
    // rewrite pin "a denied namespace re-export keeps its exported name",
    // import-protection/rewrite.ts).
    // Impact: in dev, the page fails to load [SyntaxError: '/src/barrel.ts'
    // does not provide an export named 'secrets']. Builds mock the denied
    // file itself and pass.
    'a module re-exporting a denied file as a namespace': ['vite dev'],
    // Bug: the export names of a denied file skip namespace re-exports
    // (`export * as ns from`; import-protection/analysis.ts collects only
    // the names of `ExportSpecifier`s), so the self-contained mock of the
    // file has no `helpers`.
    // Impact: a mock-mode build fails [Vite MISSING_EXPORT, Rspack
    // ESModulesLinkingError 'helpers']. Vite dev passes.
    'a denied file re-exporting a namespace': ['vite build', 'rsbuild build'],
    // Bug: mock modules declare each mocked name as `export const <name>`,
    // and reserved words such as `delete` pass the identifier check
    // (`isValidExportName`, import-protection/analysis.ts); `eval` and
    // `arguments` cannot be bound in a module either.
    // Impact: the dev page and mock-mode builds fail with a parse error
    // [Unexpected token 'delete'; PARSE_ERROR; Expected ident].
    'a denied file exporting `delete`, used as `api.delete()`': [
      'vite dev',
      'vite build',
      'rsbuild build',
    ],
    'a denied file exporting `eval` and `arguments`': [
      'vite dev',
      'vite build',
      'rsbuild build',
    ],
    // Bug: namespace member reads are collected only after the import
    // declaration that binds the namespace, but imports are hoisted: a
    // member read earlier in the file is not exported by the mock edge of
    // a denied specifier (the mock edge exports only the members read
    // after the import). Rsbuild mocks the whole namespace and passes.
    // Impact: the read gets `undefined` [db.query is not a function; Vite
    // build: (void 0) is not a function].
    // Source: PR #8504 (analysis.exports.test.ts "collects namespace member
    // usage that precedes the import").
    'a namespace member read in a function declared before the import': [
      'vite dev',
      'vite build',
    ],
    // Bug: the mock edge of a denied specifier exports only the names the
    // importer reads statically; a member read with a computed key is no
    // export of it, so `ns[key]` is `undefined`. A denied file is mocked by
    // its own exports and passes; Rsbuild mocks the whole namespace.
    // Impact: the read gets `undefined` [ns[key] is not a function].
    'a namespace member read with a computed key, of a denied specifier': [
      'vite dev',
      'vite build',
    ],
    // NEW bug (Rsbuild), not the internal pin's cause (Vite passes): a
    // mock-mode Rsbuild production build ships the real value of an enum
    // member of a denied file [read 'MARK_SECRET', the bundle contains
    // MARK_SECRET]; the namespace member is mocked.
    // Cause: Rsbuild's production SWC config collects exported enums
    // (`collectTypeScriptInfo.exportedEnum: isProd`), and Rspack inlines
    // `Color.Red` into the importer (`"MARK_SECRET"`) from the
    // denied file's own source; the import-protection loader's mock (which
    // does export `Color`) is never read. A scratch build with
    // `exportedEnum: false` mocks it.
    // Impact: server-only values declared as enum members reach the client
    // bundle in mock mode (`behavior: { build: 'mock' }`), with only a
    // warning.
    'a denied file exporting an enum and a namespace': ['rsbuild build'],
  }

  const twinTest = (channel: string, name: string) =>
    (failsOn[name] ?? []).includes(channel) ? test.fails : test

  for (const [name, twin] of Object.entries(twins)) {
    const { files, importProtection = {}, expected = [mock] } = twin
    twinTest('vite dev', name)(
      `vite dev: ${name}`,
      async () => {
        const server = await startProtectedDevServer(files, importProtection)
        // The mock reports each use in the browser console.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const module = await evaluateServed(server, '/src/entry.ts', {
          skip: /^\/@(vite|react-refresh)\b/,
        })
        expect(
          (module.read() as Array<unknown>).map((value) =>
            describeValue(value, 'MARK_SECRET'),
          ),
        ).toEqual(expected)
      },
      30_000,
    )
    for (const bundler of startBundlers) {
      twinTest(`${bundler} build`, name)(
        `${bundler} build, mock mode: ${name}`,
        async () => {
          const { client } = await buildStart({
            bundler,
            files,
            entry: 'src/entry.ts',
            start: {
              importProtection: {
                ...importProtection,
                behavior: 'mock',
                mockAccess: 'off',
              },
            },
          })
          expect({
            read: (
              await client.run(`${describeValuePrelude}
return entry.read().map((value) => describeValue(value, 'MARK_SECRET'))`)
            ).result,
            hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
          }).toEqual({ read: expected, hasRealCode: false })
        },
        60_000,
      )
    }
  }
})
