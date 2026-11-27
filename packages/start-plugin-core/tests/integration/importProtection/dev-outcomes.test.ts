/**
 * Import-protection cases main gets wrong, continued from build-outcomes.test.ts (two files,
 * to keep each within the per-file time budget): Vite dev with `behavior:
 * 'error'`, Rsbuild dev, and the app-level twins of the mock pins. Each test
 * asserts the correct behaviour for a bug main had; the ones today's compiler
 * still fails are marked .fails (oracle/KNOWN-BUGS.md, "Remaining pins"). A
 * mock is told by what it does (`mock-helpers.ts`, `describeValue`: `a safe
 * mock`), and a violation by what `onViolation` receives.
 */
import { createRequire } from 'node:module'
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test, vi } from 'vitest'
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

  // On main, in dev with behavior "error", the client of a server fn factory
  // module that calls a denied import (here `getRequest()` of
  // `@tanstack/react-start/server`) at the top level gets the real module,
  // without any error; in mock mode the same module is mocked and logged
  // (dev.test.ts "a server fn factory module that also calls a denied import at
  // the top level is logged").
  // Source: mutation testing.
  test('a server fn factory module calling a denied import at the top level fails to load', async () => {
    expect(await loadOutcome(topLevelCallApp('src/factory.ts'))).toEqual([
      'client src/factory.ts',
    ])
  }, 30_000)

  // On main, in dev with behavior "error", any module a server fn factory
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
      expectNoDiagnostic(server.diagnostics, { severity: 'error' })
      expect(
        (await runRsbuildClient(server)).filter((text) =>
          text.includes('MARK_'),
        ),
      ).toEqual(['MARK_PAGE'])
    },
    timeout,
  )

  /**
   * What a module of the custom type importing `files`' denied module
   * (behavior "error") reports, and whether its real code ran.
   */
  async function customTypeOutcome(files: Record<string, string>) {
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
    // (a denied module fails to build: the page throws the denial)
    const messages = await runRsbuildClient(server).catch((error: unknown) =>
      String(error).includes('[import-protection] Import denied')
        ? []
        : Promise.reject(error as Error),
    )
    return {
      reported: reportedImporters({
        root: server.root,
        violations: recorder.violations,
      }),
      ranRealCode: messages.some((message) => message.includes('MARK_')),
    }
  }

  // The importer is not compiled (below), but the denied file is, in the
  // client: it is its own violation, mocked and reported, named itself (a
  // dev server knows no importer of it when it compiles it).
  test(
    'a module of a custom type importing a denied file is reported, and its real code does not run',
    async () => {
      expect(
        await customTypeOutcome({
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/home.page': `import { secret } from './secret.server'\nexport const page = () => secret()\n`,
        }),
      ).toEqual({
        reported: ['client src/secret.server.ts'],
        ranRealCode: false,
      })
    },
    timeout,
  )

  // Bug: Rsbuild import protection checks importers by file extension (the
  // Start loader rule's `JS_FILE_RE`, src/rsbuild/start-compiler.ts: only
  // JS/TS extensions), and that rule only compiles those files, so an
  // importer of another module type that compiles to JS (a custom type
  // here, `.mdx` through its real loader below) is never checked: a denied
  // specifier is neither reported nor mocked (a denied file is, as its own
  // violation, above).
  // Impact: behavior "error" does not fail for denied specifiers of such
  // modules, and their real code runs on the client.
  // Source: mutation testing; the JS/TS
  // extensions are covered by rsbuild/import-protection.test.ts "is reported
  // when it is a .$extension file".
  test.fails(
    'a module of a custom type importing a denied specifier is reported, and its real code does not run',
    async () => {
      expect(
        await customTypeOutcome({
          'node_modules/db-lib/package.json': JSON.stringify({
            name: 'db-lib',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/db-lib/index.js': `export const secret = () => 'MARK_LIB'\n`,
          'src/home.page': `import { secret } from 'db-lib'\nexport const page = () => secret()\n`,
        }),
      ).toEqual({ reported: ['client src/home.page'], ranRealCode: false })
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

  // Through the real `@mdx-js/loader`: the page is compiled from MDX, with
  // the loader's source map; a report names the page at the import (line 3)
  // or the use (4:27) in the .mdx source (SPEC J6.5). With behavior "error"
  // the importing module fails to build (J6.3), so the page throws that
  // denial instead of running the real code (as for a JS importer).
  test.each<{ name: string; files: Record<string, string> }>([
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
      // (the denied page fails to build: the page throws the denial)
      const messages = await runRsbuildClient(server).catch((error: unknown) =>
        String(error).includes('[import-protection] Import denied')
          ? []
          : Promise.reject(error as Error),
      )
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
 * expects a real value, and the app must load or build. Every twin is a
 * directory of one app per channel (`outcomeOf`).
 * Source: review (missing coverage, computed keys).
 */
describe('app-level twins of the mock pins', () => {
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
   * Every twin in one app: twin `i` is `src/t<i>/` (its `src/` files moved
   * there, `MARK_SECRET` in them made `MARK_SECRET_T<i>_`), the packages
   * shared (`db-lib`'s secret `MARK_SECRET_DBLIB`); the entry gives each
   * twin's `read` by name, and the denied specifiers of every twin are
   * denied (only the twins naming one import it).
   */
  const names = Object.keys(twins)
  const twinFiles = (i: number): Record<string, string> =>
    Object.fromEntries(
      Object.entries(twins[names[i]!]!.files).map(([file, text]) =>
        file.startsWith('src/')
          ? [
              file.replace(/^src\//, `src/t${i}/`),
              text.replaceAll('MARK_SECRET', `MARK_SECRET_T${i}_`),
            ]
          : [file, text.replaceAll('MARK_SECRET', 'MARK_SECRET_DBLIB')],
      ),
    )
  const app: Record<string, string> = {
    ...Object.assign({}, ...names.map((_, i) => twinFiles(i))),
    'src/entry.ts': `${names.map((_, i) => `import * as t${i} from './t${i}/entry'`).join('\n')}
export const reads: Record<string, () => Array<unknown>> = {
${names.map((name, i) => `  ${JSON.stringify(name)}: t${i}.read,`).join('\n')}
}
`,
  }
  const twinOptions: ImportProtectionOptions = {
    client: {
      specifiers: [
        ...new Set(
          Object.values(twins).flatMap(
            ({ importProtection }) =>
              importProtection?.client?.specifiers ?? [],
          ),
        ),
      ],
    },
  }
  /** The script of every channel: what each twin's `read()` gives, described. */
  const script = `${describeValuePrelude}
return Object.fromEntries(
  Object.entries(entry.reads).map(([name, read]) => {
    try {
      return [name, read().map((value) => describeValue(value, 'MARK_SECRET'))]
    } catch (error) {
      return [name, ['throws: ' + String(error)]]
    }
  }),
)`
  /** The secrets of twin `i` (none may reach a client bundle). */
  const secretsOf = (i: number) => [
    ...new Set(
      Object.values(twinFiles(i)).flatMap(
        (text) => text.match(/MARK_SECRET\w*/g) ?? [],
      ),
    ),
  ]

  type Channel = 'vite dev' | `${(typeof startBundlers)[number]} build`
  const outcomes = new Map<
    Channel,
    Promise<{
      read: Record<string, Array<string>>
      hasRealCode: (i: number) => boolean
    }>
  >()
  /** What each twin gives on `channel` (and whether its secrets shipped), the app served or built once. */
  function outcomeOf(channel: Channel) {
    let outcome = outcomes.get(channel)
    if (!outcome) {
      outcome = (async () => {
        if (channel === 'vite dev') {
          const server = await startBrowserProtectedDevServer(app, twinOptions)
          // The mock reports each use in the browser console.
          const silenced = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
          try {
            const { result } = await runViteClient(
              server,
              '/src/entry.ts',
              script,
            )
            return {
              read: result as Record<string, Array<string>>,
              hasRealCode: () => false,
            }
          } finally {
            silenced.mockRestore()
          }
        }
        const { client } = await buildStart({
          bundler: channel === 'vite build' ? 'vite' : 'rsbuild',
          files: app,
          entry: 'src/entry.ts',
          start: {
            importProtection: {
              ...twinOptions,
              behavior: 'mock',
              mockAccess: 'off',
            },
          },
        })
        const read = (await client.run(script)).result as Record<
          string,
          Array<string>
        >
        const shipped = new Set(
          names.flatMap((_, i) =>
            secretsOf(i).filter((secret) => client.where(secret) !== 'nowhere'),
          ),
        )
        return {
          read,
          hasRealCode: (i) =>
            secretsOf(i).some((secret) => shipped.has(secret)),
        }
      })()
      outcomes.set(channel, outcome)
    }
    return outcome
  }

  for (const [i, name] of names.entries()) {
    const { expected = [mock] } = twins[name]!
    test(`vite dev: ${name}`, async () => {
      expect((await outcomeOf('vite dev')).read[name]).toEqual(expected)
    }, 30_000)
    for (const bundler of startBundlers) {
      test(`${bundler} build, mock mode: ${name}`, async () => {
        const { read, hasRealCode } = await outcomeOf(`${bundler} build`)
        expect({ read: read[name], hasRealCode: hasRealCode(i) }).toEqual({
          read: expected,
          hasRealCode: false,
        })
      }, 60_000)
    }
  }
})
