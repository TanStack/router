/**
 * Known import-protection bugs. Each test asserts correct behaviour for a bug
 * on main and is marked .fails; remove .fails when the bug is fixed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { rewriteDeniedImports } from '../../src/import-protection/rewrite'
import { buildStart, startBundlers } from '../build-harness'
import { runRsbuildClient, startRsbuildDevServer } from '../rsbuild-dev-server'
import { evaluateWithMock, isMock, selfMock } from './mock-helpers'
import {
  factoryTopLevelCall,
  rejection,
  reportedViolations,
  serverFnFactoryApp,
  startProtectedDevServer,
} from './start-apps'
import type { RsbuildConfig } from '@rsbuild/core'

const mockModule = `data:text/javascript,${encodeURIComponent(
  `export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? 'mock:' + key : undefined })`,
)}`

async function evaluateRewritten(code: string, denied: Array<string>) {
  const rewritten = rewriteDeniedImports(
    code,
    '/test/module.ts',
    new Set(denied),
    () => mockModule,
  )
  expect(rewritten).toBeDefined()
  const { code: javascript } = await transformWithOxc(
    rewritten!.code,
    'module.ts',
  )
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(javascript)}`
  )) as Record<string, unknown>
}

// Control for the namespace re-export pin below (same harness).
test('a denied named import evaluates to the mock', async () => {
  const exports = await evaluateRewritten(
    `import { secret } from 'denied'
export const seen = secret`,
    ['denied'],
  )
  expect({ ...exports }).toEqual({ seen: 'mock:secret' })
})

// Bug: rewriting a denied `export * as ns from 'denied'` drops the `ns`
// export.
// Impact: importers of `ns` get `undefined` (or a missing export error)
// instead of the mock, unlike every other denied import form.
test.fails('a denied namespace re-export keeps its exported name', async () => {
  const exports = await evaluateRewritten(
    `export * as ns from 'denied'
export const keep = 1`,
    ['denied'],
  )
  expect(exports.keep).toBe(1)
  expect((exports.ns as Record<string, unknown> | undefined)?.secret).toBe(
    'mock:secret',
  )
})

/**
 * Rewrites the denied import of a module with JSX that `prologue` (comments,
 * directives) leads, and compiles its JSX with React's automatic runtime
 * unless a pragma says otherwise. Returns whether the rewritten module keeps
 * `comment`, and the JSX runtime the compiled module imports.
 */
async function rewriteWithPrologue(prologue: string, comment: string) {
  const rewritten = rewriteDeniedImports(
    `${prologue}
import { secret } from 'denied'
export const Page = () => <div>{secret}</div>`,
    '/test/module.tsx',
    new Set(['denied']),
    () => mockModule,
  )
  const { code } = await transformWithOxc(rewritten!.code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return [
    rewritten!.code.includes(comment),
    code.match(/from ["']([^"']+\/jsx-runtime)["']/)?.[1],
  ]
}

const leadingComments = [
  {
    name: 'a JSX pragma',
    comment: '/** @jsxImportSource preact */',
    runtime: 'preact/jsx-runtime',
  },
  {
    name: 'a legal comment',
    comment: '/*! @license MIT */',
    runtime: 'react/jsx-runtime',
  },
]

// Control for the pin below (same harness): after a directive, the comment
// stays in effect. Guards a regression of the Yuku migration (PR #8504,
// rewrite.test.ts "keeps a JSX pragma that follows a directive in effect").
test.each(leadingComments)(
  '$name that follows a directive before a denied import stays in effect',
  async ({ comment, runtime }) => {
    expect(
      await rewriteWithPrologue(`'use client'\n${comment}`, comment),
    ).toEqual([true, runtime])
  },
)

// Bug: rewriting a denied import to the mock drops the comments that lead
// the import, such as a file's JSX pragma or legal comment.
// Impact: in dev, a JSX plugin that runs after the rewrite (e.g.
// @vitejs/plugin-vue-jsx listed after the Start plugin, which reads `@jsx`
// from any comment) compiles the module with the default JSX runtime, and the
// module loses its license comment.
test.fails.each(leadingComments)(
  '$name that leads a denied import stays in effect',
  async ({ comment, runtime }) => {
    expect(await rewriteWithPrologue(comment, comment)).toEqual([true, runtime])
  },
)

// Bug: mock modules declare each mocked name as `export const <name>`, and
// reserved words such as `delete` pass the identifier check.
// Impact: the mock of a denied module that exports a reserved word
// (`export { remove as delete }`) or is used through one (`api.delete()`) is a
// SyntaxError, which fails the build instead of mocking the module.
test.fails(
  'the mock of a denied file exporting `delete` exports it',
  async () => {
    const mock = await selfMock(
      `const remove = () => {}
export { remove as delete }`,
      '/test/api.server.ts',
    )
    expect('delete' in mock && mock.delete !== undefined).toBe(true)
  },
)

test.fails(
  'a denied import used as `api.delete()` evaluates to a mock',
  async () => {
    const module = await evaluateWithMock(
      `import * as api from 'denied'
export const result = api.delete()`,
      'denied',
    )
    expect(isMock(module.result)).toBe(true)
  },
)

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

describe.each(startBundlers)('%s build', (bundler) => {
  // Control for the pin below (same harness): a denied module whose code the
  // client bundle contains fails the build.
  test('a denied module the client uses fails the build', async () => {
    await expect(
      buildStart({
        bundler,
        files: {
          'src/corpus.ts': corpusModule,
          'src/entry.ts': `import { corpus } from './corpus'\nexport const read = () => corpus()\n`,
        },
        entry: 'src/entry.ts',
        start: denyToClient(['**/corpus.ts']),
      }),
    ).rejects.toThrow(/Import denied in client environment/)
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
  test.fails(
    'in mock mode, an unused denied module leaves no mock in the client bundle and no warning',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: droppedCorpusFiles,
        entry: 'src/entry.ts',
        start: mockToClient(['**/corpus.ts']),
      })
      expect({
        mock: client.where('[import-protection mock]'),
        warnings: client.warnings.filter((warning) =>
          warning.includes('[import-protection]'),
        ),
      }).toEqual({ mock: 'nowhere', warnings: [] })
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

  /** The violations loading the app reports, or `'loaded'`. */
  async function loadOutcome(files: Record<string, string>) {
    const server = await startProtectedDevServer(files, { behavior: 'error' })
    return server.load('/src/entry.ts').then(
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
  /** A module type another loader compiles to JS (a stand-in for `.mdx`). */
  const pageModules: RsbuildConfig = {
    tools: {
      rspack: {
        module: { rules: [{ test: /\.page$/, type: 'javascript/auto' }] },
      },
    },
  }

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
  // and mocked when it is a .$extension file".
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
    30_000,
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
      compileTimeout: 3_000,
      files: {
        'src/secret.server.ts': `export const secret = () => 'secret'\n`,
        'src/entry.ts': `import { secret } from './secret.server'\nconsole.log(secret())\n`,
      },
    }).then(
      (server) => server.errors.join('\n'),
      (error: Error) => error.message,
    )
    expect(outcome).toContain('MARK_THROWN')
  }, 15_000)
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
export const read = () => String(secret)
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'mock' } },
    })
    return {
      warned: reportedViolations(client.warnings).length > 0,
      hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
      read: (await client.run(`return entry.read()`)).result,
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
      ).toEqual({
        warned: true,
        hasRealCode: false,
        read: '[import-protection mock]',
      })
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
      ).toEqual({
        warned: true,
        hasRealCode: false,
        read: '[import-protection mock]',
      })
    },
    60_000,
  )
})
