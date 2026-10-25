/**
 * Known import-protection bugs, continued from known-bugs.test.ts (two
 * files, to keep each within the per-file time budget): Vite dev with
 * `behavior: 'error'`, Rsbuild dev, and the app-level twins of the mock
 * pins. Each test asserts correct behaviour for a bug on main and is marked
 * .fails where it still fails (the Rsbuild path is on the previous
 * compiler); remove .fails when the bug is fixed. A mock is told by what it
 * does (`mock-helpers.ts`, `describeValue`: `a safe mock`), and a violation
 * by what `onViolation` receives.
 */
import { createRequire } from 'node:module'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  distinct,
  factoryTopLevelCall,
  rejection,
  reportedImporters,
  reportedViolations,
  serverFnFactoryApp,
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import { originalLocation } from '../../importProtection/original-location'
import {
  runRsbuildClient,
  runViteClient,
  startBrowserProtectedDevServer,
  startBrowserRsbuildDevServer,
} from './client-pages'
import type { RsbuildConfig } from '@rsbuild/core'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const require = createRequire(import.meta.url)

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
   * The importers of the violations loading the app's modules reports
   * (`onViolation`), or `'loaded'`. (Not the modules of
   * `@tanstack/react-start/server`, which imports Start's entries, which
   * only Start's whole plugin provides.)
   */
  async function loadOutcome(files: Record<string, string>) {
    const server = await startProtectedDevServer(files, { behavior: 'error' })
    const failed = await rejection(
      server.load('/src/entry.ts', { skip: /^\/@(vite|fs)\// }),
    ).then(
      () => true,
      () => false,
    )
    // (each time the import resolves, with behavior "error")
    return failed ? distinct(reportedImporters(server)) : 'loaded'
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
  // Source: mutation testing.
  test('a server fn factory module calling a denied import at the top level fails to load', async () => {
    expect(await loadOutcome(topLevelCallApp('src/factory.ts'))).toEqual([
      'client src/factory.ts',
    ])
  }, 30_000)

  // Bug: same cause as the pin above, one module further: when the Start
  // compiler's lookup of a server fn factory module resolves the module's
  // imports, import protection records each imported module as a lookup
  // module too (vite/import-protection-plugin/plugin.ts `resolveId`,
  // "Propagate pre-transform status transitively"), by its path, so the
  // client's own transform of that module is silenced as well.
  // Impact: in dev with behavior "error", any module a server fn factory
  // module imports gets the real denied module when it calls it at the top
  // level, without any error (the control above fails to load).
  // Source: mutation testing.
  test('a module a server fn factory module imports, calling a denied import at the top level, fails to load', async () => {
    const app = topLevelCallApp('src/other.ts')
    app['src/factory.ts'] += `export { request } from './other'\n`
    app['src/entry.ts'] = `export { fn } from './usage'\n`
    expect(await loadOutcome(app)).toEqual(['client src/other.ts'])
  }, 30_000)
})

describe('Rsbuild dev', () => {
  /**
   * Only a guard against a compile that never comes, never shorter than the
   * test's timeout (rsbuild/import-protection.test.ts).
   */
  const timeout = 60_000
  const compileTimeout = timeout

  /**
   * A custom module type of the app: an Rspack rule takes `.page` files as
   * JavaScript (no other compiler; the real MDX loader is below).
   */
  const pageModules: RsbuildConfig = {
    tools: {
      rspack: {
        module: { rules: [{ test: /\.page$/, type: 'javascript/auto' }] },
      },
    },
  }

  // Control for the pins below (same config and import protection): a
  // module of that type is compiled, and its code runs in the client.
  test(
    'a module of a custom type without a denied import runs in the client',
    async () => {
      const server = await startBrowserRsbuildDevServer({
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
      // Nothing fails, on any channel
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }),
      ).toEqual([])
      expect(
        (await runRsbuildClient(server)).filter((text) =>
          text.includes('MARK_'),
        ),
      ).toEqual(['MARK_PAGE'])
    },
    timeout,
  )

  // Bug: Rsbuild import protection checks importers by file extension
  // (`isImportProtectionSourceFile`, rsbuild/import-protection.ts, only
  // JS/TS extensions), and its loader rule only rewrites those files, so an
  // importer of another module type that compiles to JS (a custom type
  // here, `.mdx` through its real loader below) is never checked: a denied
  // file is mocked (the file rule) but not reported, and a denied specifier
  // is neither reported nor mocked.
  // Impact: behavior "error" does not fail for denied imports of such
  // modules, and the real code of a denied specifier runs on the client.
  // Source: mutation testing; the JS/TS
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
    'a module of a custom type importing $name is reported, and its real code does not run',
    async ({ files }) => {
      const recorder = violationRecorder({
        behavior: 'error',
        client: { specifiers: ['db-lib'] },
      })
      const server = await startBrowserRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        config: pageModules,
        files: {
          ...files,
          'src/entry.ts': `import { page } from './home.page'\nconsole.log(page())\n`,
        },
      })
      const messages = await runRsbuildClient(server)
      expect({
        reported: reportedImporters({
          root: server.root,
          violations: recorder.violations,
        }),
        ranRealCode: messages.some((message) => message.includes('MARK_')),
      }).toEqual({ reported: ['client src/home.page'], ranRealCode: false })
    },
    timeout,
  )

  /** MDX pages through the real MDX loader, as an Rsbuild app adds it. */
  const mdxModules: RsbuildConfig = {
    output: { sourceMap: { js: 'source-map' } },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /\.mdx$/,
              use: [{ loader: require.resolve('@mdx-js/loader') }],
            },
          ],
        },
      },
    },
  }

  // The same bug through the real `@mdx-js/loader`: the page is
  // compiled from MDX, with the loader's source map; a report names the page
  // at the import (line 3) or the use (4:27) in the .mdx
  // source (SPEC J6.5).
  test.fails.each<{ name: string; files: Record<string, string> }>([
    {
      name: 'a denied file',
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/home.mdx': `# Home

import { secret } from './secret.server'
export const page = () => secret()
`,
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
        'src/home.mdx': `# Home

import { secret } from 'db-lib'
export const page = () => secret()
`,
      },
    },
  ])(
    'an .mdx page importing $name is reported in its source, and its real code does not run',
    async ({ files }) => {
      const recorder = violationRecorder({
        behavior: 'error',
        client: { specifiers: ['db-lib'] },
      })
      const server = await startBrowserRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        config: mdxModules,
        files: {
          ...files,
          'src/entry.ts': `import { page } from './home.mdx'\nconsole.log(page())\n`,
        },
      })
      const messages = await runRsbuildClient(server)
      expect({
        reported: reportedViolations({
          root: server.root,
          violations: recorder.violations,
        }).map(({ environment, importer }) => `${environment} ${importer}`),
        ranRealCode: messages.some((message) => message.includes('MARK_')),
      }).toEqual({
        reported: [originalLocation('client src/home.mdx:4:27', 3)],
        ranRealCode: false,
      })
    },
    timeout,
  )

  // Control for the pins above (same loader): the page compiles and runs.
  test(
    'an .mdx page without a denied import runs in the client',
    async () => {
      const server = await startBrowserRsbuildDevServer({
        compileTimeout,
        importProtection: { behavior: 'error' },
        config: mdxModules,
        files: {
          'src/home.mdx': `# Home

export const page = () => 'MARK_PAGE'
`,
          'src/entry.ts': `import { page } from './home.mdx'\nconsole.log(page())\n`,
        },
      })
      // Nothing fails, on any channel
      expect(
        findDiagnostics(server.diagnostics, { severity: 'error' }),
      ).toEqual([])
      expect(
        (await runRsbuildClient(server)).filter((text) =>
          text.includes('MARK_'),
        ),
      ).toEqual(['MARK_PAGE'])
    },
    timeout,
  )

  // In Rsbuild dev, an error thrown by `onViolation` (awaited in the
  // `processAssets` hook, rsbuild/import-protection.ts `reportViolation`)
  // fails the compile: Rspack gives up on it (`compiler.hooks.failed`, no
  // `done`) and Rsbuild logs the error, like a build fails with it.
  // Source: mutation testing. This was a pin ("never reported") while the
  // dev harness only waited for `done`; the harness now fails the compile
  // wait with the error Rspack reports.
  test(
    'an onViolation that throws ends the compile with its error',
    async () => {
      const outcome = await startBrowserRsbuildDevServer({
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
        (server) =>
          findDiagnostics(server.diagnostics, { severity: 'error' })
            .map(({ text }) => text)
            .join('\n'),
        (error: Error) => error.message,
      )
      expect(outcome).toContain('MARK_THROWN')
    },
    timeout,
  )
})

/**
 * App-level twins of the pins on internal functions (the rewrite and the
 * mock modules): a real app with each input, on a Vite dev server (mock
 * mode, the dev default) and in mock-mode builds. `src/entry.ts` exports
 * `read()`, which returns what the app gets from its denied import, as an
 * array of values; each must be a safe mock (`a safe mock`) unless a row
 * expects a real value, and the app must load or build.
 * Source: review (missing coverage, computed keys).
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

  /** A custom JSX runtime whose `jsx` renders `MARK_CUSTOM_JSX`. */
  const customJsx = {
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
  }

  interface TwinCase {
    files: Record<string, string>
    importProtection?: ImportProtectionOptions
    /** What `entry.read()` gives, described (default: one safe mock). */
    expected?: Array<string>
  }

  const twins: Record<string, TwinCase> = {
    // Twin of the rewrite pin "a denied namespace re-export keeps its
    // exported name" (a former in-process pin).
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
    // A JSX pragma leading a denied import: the page renders with the
    // runtime its pragma names (a custom JSX runtime is valid user input),
    // whatever the rewrite does with the comment (SPEC J2.16, §5 item 5).
    'a JSX pragma leading a denied import': {
      files: {
        ...customJsx,
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
    // The same pragma leading the import of a denied specifier, which is
    // rewritten in the importer itself (a denied file is mocked in its own
    // module instead).
    'a JSX pragma leading the import of a denied specifier': {
      files: {
        ...customJsx,
        ...deniedDependency('db-lib'),
        'src/page.tsx': `/** @jsxImportSource custom-jsx */
import { query } from 'db-lib'
export const Page = () => <div>{String(query())}</div>
`,
        'src/entry.ts': `import { Page } from './page'
export const read = () => [Page()]
`,
      },
      importProtection: { client: { specifiers: ['db-lib'] } },
      expected: ['MARK_CUSTOM_JSX'],
    },
    // The pragma after a directive (a regression of the Yuku migration, PR
    // #8504, kept the comment of this shape only).
    'a JSX pragma after a directive, leading the import of a denied specifier':
      {
        files: {
          ...customJsx,
          ...deniedDependency('db-lib'),
          'src/page.tsx': `'use client'
/** @jsxImportSource custom-jsx */
import { query } from 'db-lib'
export const Page = () => <div>{String(query())}</div>
`,
          'src/entry.ts': `import { Page } from './page'
export const read = () => [Page()]
`,
        },
        importProtection: { client: { specifiers: ['db-lib'] } },
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
   * brackets). The JSX pragma twins pass everywhere: Vite (Oxc) and Rsbuild
   * (SWC) compile JSX before import protection rewrites the import. (A
   * former in-process pin, "a JSX pragma that leads a denied import stays in
   * effect", needed a JSX plugin that runs after the rewrite; none of the
   * available real plugins does, so it was removed.)
   */
  const failsOn: Record<string, Array<string>> = {
    // (The Vite channels of the twins below passed with the Yuku host's
    // edge modules, whose mock exports the target's export names; the
    // Rsbuild path is still on the previous compiler.)
    // Bug (Rsbuild): the export names of a denied file skip namespace
    // re-exports (`export * as ns from`; import-protection/analysis.ts
    // collects only the names of `ExportSpecifier`s), so the self-contained
    // mock of the file has no `helpers`.
    // Impact: a mock-mode build fails [Rspack ESModulesLinkingError
    // 'helpers'].
    'a denied file re-exporting a namespace': ['rsbuild build'],
    // Bug (Rsbuild): mock modules declare each mocked name as `export const
    // <name>`, and reserved words such as `delete` pass the identifier check
    // (`isValidExportName`, import-protection/analysis.ts); `eval` and
    // `arguments` cannot be bound in a module either.
    // Impact: mock-mode builds fail with a parse error [Expected ident].
    'a denied file exporting `delete`, used as `api.delete()`': [
      'rsbuild build',
    ],
    'a denied file exporting `eval` and `arguments`': ['rsbuild build'],
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
        const server = await startBrowserProtectedDevServer(
          files,
          importProtection,
        )
        // The mock reports each use in the browser console.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { result } = await runViteClient(
          server,
          '/src/entry.ts',
          `${describeValuePrelude}
return entry.read().map((value) => describeValue(value, 'MARK_SECRET'))`,
        )
        expect(result).toEqual(expected)
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
