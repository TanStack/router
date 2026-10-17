/**
 * Import protection in a real Start build (Vite and Rsbuild): what survives
 * into the client bundle is reported, and invalid markers fail the build.
 * Import protection checks the modules of the source directory (`src`).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, routerRuntimeFiles, startBundlers } from '../build-harness'
import { rejection, reportedViolations } from './start-apps'
import type { TanStackStartInputConfig } from '../../src/schema'

const timeout = 60_000

/**
 * Start's import protection options of a build that fails on a violation,
 * denying `files` to the client.
 */
function importProtection(files: Array<string> = []) {
  return { importProtection: { behavior: 'error', client: { files } } } as const
}

/** A server-only module (denied to the client by `importedAs`). */
const deniedModules = {
  'a denied file': {
    importedAs: './secret.server',
    files: {
      'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    },
  },
  'a server-only-marked module': {
    importedAs: './marked',
    files: {
      'src/marked.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SECRET'
`,
    },
  },
}
type DeniedModule = keyof typeof deniedModules
const deniedModuleNames = Object.keys(deniedModules) as Array<DeniedModule>

/** A client-only module (denied to the server by its marker). */
const clientOnlyMarked = {
  'src/marked.ts': `import '@tanstack/react-start/client-only'
export const secret = () => 'MARK_SECRET'
`,
}

/** An app whose client entry `src/entry.ts` uses `denied`. */
function appUsing(denied: DeniedModule) {
  const { importedAs, files } = deniedModules[denied]
  return {
    ...files,
    'src/entry.ts': `import { secret } from '${importedAs}'
export const read = () => secret()
`,
  }
}

/** Builds `files` with `bundler`; what the client gets from `entry.read()`. */
async function clientRead(
  bundler: (typeof startBundlers)[number],
  files: Record<string, string>,
  start: TanStackStartInputConfig,
) {
  const { client } = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start,
  })
  const read = (await client.run(`return String(entry.read())`))
    .result as string
  return {
    /** The real module's code is in the client bundle. */
    hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
    /** `entry.read()` ran the real module. */
    ranReal: read === 'MARK_SECRET',
    warnings: client.warnings,
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  // A denied pure re-export barrel whose export the client uses survives
  // into the client bundle (as the code it re-exports), so it must be
  // reported.
  // Source: issue #8102 (closed without a reproduction: Rolldown may elide
  // the barrel from `chunk.modules`); gap IP6b (gaps/start-env.md).
  test(
    'a denied re-export barrel the client uses fails the build',
    async () => {
      await expect(
        buildStart({
          bundler,
          files: {
            'src/secret.ts': `export const secret = () => 'MARK_SECRET' + Math.random()\n`,
            'src/barrel.ts': `export { secret } from './secret'\n`,
            'src/entry.ts': `import { secret } from './barrel'\nexport const read = () => secret()\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(['**/barrel.ts']),
        }),
      ).rejects.toThrow(/Import denied in client environment/)
    },
    timeout,
  )

  // Source: gap IP5 (gaps/start-env.md).
  test(
    'a file with both a server-only and a client-only marker fails the build',
    async () => {
      await expect(
        buildStart({
          bundler,
          files: {
            'src/both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const value = 1
`,
            'src/entry.ts': `import { value } from './both'\nexport const read = () => value\n`,
          },
          entry: 'src/entry.ts',
          start: importProtection(),
        }),
      ).rejects.toThrow(/has both server-only and client-only markers/)
    },
    timeout,
  )
})

// Start's default import protection (no options): the defaults deny
// `*.server.*` files, `@tanstack/<framework>-start/server` and modules marked
// server-only to the client, and a build fails on a violation.
// Source: oracle-gaps H2 / gap IP1 (the default rules were never built in
// error mode: every build test replaced `client.files`).
describe.each(startBundlers)('%s build, default rules', (bundler) => {
  test.each<{ name: string; files: Record<string, string>; reported: string }>([
    {
      name: 'a client import of a *.server.* file',
      files: appUsing('a denied file'),
      reported: 'src/entry.ts:2:27',
    },
    {
      name: 'a client import of a *.server.* file in a dot directory',
      files: {
        'src/.private/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/entry.ts': `import { secret } from './.private/db.server'
export const read = () => secret()
`,
      },
      reported: 'src/entry.ts:2:27',
    },
    {
      name: 'a client import of @tanstack/react-start/server',
      files: {
        'src/entry.ts': `import { getRequest } from '@tanstack/react-start/server'
export const read = () => getRequest()
`,
      },
      reported: 'src/entry.ts:2:27',
    },
  ])(
    '$name fails the build, naming the importer at the use',
    async ({ files, reported }) => {
      const error = await rejection(
        buildStart({ bundler, files, entry: 'src/entry.ts' }),
      )
      expect(reportedViolations(error.message)).toEqual([
        { environment: 'client', importer: reported },
      ])
    },
    timeout,
  )

  test(
    'a client import of a server-only-marked module fails the build, naming the module and its importer',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: appUsing('a server-only-marked module'),
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error.message)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/marked\.ts/),
        },
      ])
      expect(error.message).toContain('src/entry.ts')
    },
    timeout,
  )

  test(
    'a server import of a client-only-marked module fails the build, naming the module',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...clientOnlyMarked,
            'src/server.ts': `import { secret } from './marked'
export const read = () => secret()
`,
            'src/client.ts': `export const read = () => 'client'\n`,
          },
          entry: { client: 'src/client.ts', ssr: 'src/server.ts' },
        }),
      )
      expect(reportedViolations(error.message)).toEqual([
        {
          environment: 'server',
          importer: expect.stringMatching(/^src\/marked\.ts/),
        },
      ])
    },
    timeout,
  )

  // Several modules import the marked module (directly and through a
  // re-export), so the marker check sees it imported after it has seen its
  // marker.
  test.each([
    { env: 'ssr', marker: 'server-only', build: 'server' },
    { env: 'client', marker: 'client-only', build: 'client' },
  ] as const)(
    'the $build build may import a $marker-marked module from several modules, without any import-protection output',
    async ({ env, marker }) => {
      const built = await buildStart({
        bundler,
        files: {
          'src/marked.ts': `import '@tanstack/react-start/${marker}'
export const secret = () => 'MARK_SECRET'
`,
          'src/d.ts': `import { secret } from './marked'
export const d = () => secret()
`,
          'src/c.ts': `export { d } from './d'\n`,
          'src/user.ts': `import { secret } from './marked'
import { d } from './c'
export const read = () => secret() + '|' + d()
`,
          'src/other.ts': `export const read = () => 'other'\n`,
        },
        entry:
          env === 'ssr'
            ? { client: 'src/other.ts', ssr: 'src/user.ts' }
            : { client: 'src/user.ts', ssr: 'src/other.ts' },
      })
      expect((await built[env].run(`return entry.read()`)).result).toBe(
        'MARK_SECRET|MARK_SECRET',
      )
      expect(
        [
          ...built.client.warnings,
          ...built.ssr.warnings,
          ...built.client.consoleMessages,
        ].filter((message) => message.includes('import-protection')),
      ).toEqual([])
    },
    timeout,
  )

  test(
    'enabled: false checks nothing: the client gets the real module',
    async () => {
      expect(
        await clientRead(bundler, appUsing('a denied file'), {
          importProtection: { enabled: false },
        }),
      ).toEqual({ hasRealCode: true, ranReal: true, warnings: [] })
    },
    timeout,
  )
})

// A build reports the denied imports that survive tree-shaking: "If an import
// is eliminated from the final bundle, no violation is reported"
// (guide/import-protection.md, "False Positives: Dev vs Build"; its example is a marked file
// re-exported through a mixed barrel that the client never uses).
// Source: mutation run R4 (generateBundle's survival check, spc:5266, 5268,
// 5275).
describe.each(startBundlers)('%s build, tree-shaken imports', (bundler) => {
  // Bug (Rsbuild): same as the pins "a denied module the client bundle drops
  // does not fail the build" (known-bugs.test.ts): the Rsbuild report step
  // walks every module of the module graph, used or not, so the marked
  // module the client bundle drops still fails the build.
  // Impact: on Rsbuild, a mixed barrel re-exporting a server-only-marked
  // module fails the build even when the client only uses its other exports.
  const barrelTest = bundler === 'rsbuild' ? test.fails : test
  barrelTest(
    'a server-only-marked module re-exported by a barrel the client uses other exports of builds without any report',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          ...deniedModules['a server-only-marked module'].files,
          'src/barrel.ts': `export { secret } from './marked'
export const label = () => 'client'
`,
          'src/entry.ts': `import { label } from './barrel'
export const read = () => label()
`,
        },
        entry: 'src/entry.ts',
      })
      expect({
        reported: reportedViolations(client.warnings),
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (await client.run(`return entry.read()`)).result,
      }).toEqual({ reported: [], hasRealCode: false, read: 'client' })
    },
    timeout,
  )
})

// `behavior: 'mock'` builds: a denied import is replaced with a mock (and
// a warning); the real module's code stays out of the bundle.
describe.each(startBundlers)('%s build, mock mode', (bundler) => {
  interface MockedImport {
    /** The specifier `src/entry.ts` imports `secret` with. */
    importedAs: string
    files: Record<string, string>
    /** Other imports of `src/entry.ts`. */
    imports?: string
    /** The environment that imports it (default `client`). */
    env?: 'client' | 'ssr'
  }

  /**
   * What the environment that imports `secret` gets for it in a mock-mode
   * build.
   */
  async function mockedRead(denied: MockedImport) {
    const env = denied.env ?? 'client'
    const built = await buildStart({
      bundler,
      files: {
        ...denied.files,
        'src/entry.ts': `${denied.imports ?? ''}import { secret } from '${denied.importedAs}'
export const read = () => secret
`,
        'src/other.ts': `export const read = () => 'other'\n`,
      },
      entry:
        env === 'client'
          ? 'src/entry.ts'
          : { client: 'src/other.ts', ssr: 'src/entry.ts' },
      start: { importProtection: { behavior: 'mock' } },
    })
    const { result, logs } = await built[env].run(`const secret = entry.read()
return String(secret())`)
    return {
      warned: reportedViolations(built[env].warnings).length > 0,
      hasRealCode: built[env].where('MARK_SECRET') !== 'nowhere',
      /** What calling `secret` returns, converted to a string. */
      read: result,
      /** What using it logged. */
      logs,
    }
  }

  /** A mock converts to this text; the mocks of a build are silent. */
  const mocked = {
    warned: true,
    hasRealCode: false,
    read: '[import-protection mock]',
    logs: [],
  }

  const deniedFile = (extension: string): MockedImport => ({
    importedAs: `./secret.server.${extension}`,
    files: {
      [`src/secret.server.${extension}`]: `export const secret = () => 'MARK_SECRET'\n`,
    },
  })

  const deniedFiles: Record<string, MockedImport> = {
    'a denied file': deniedModules['a denied file'],
    'a denied .server.mts file': deniedFile('mts'),
    'a denied .server.mjs file': deniedFile('mjs'),
    'a denied file of a module that imports CSS': {
      ...deniedModules['a denied file'],
      files: {
        ...deniedModules['a denied file'].files,
        'src/style.css': `.page { color: red }\n`,
      },
      imports: `import './style.css'\n`,
    },
  }

  test.each(Object.keys(deniedFiles))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(deniedFiles[name]!)).toEqual(mocked)
    },
    timeout,
  )

  const markedModules: Record<string, MockedImport> = {
    'a server-only-marked module': deniedModules['a server-only-marked module'],
    'a client-only-marked module imported by the server': {
      importedAs: './marked',
      files: clientOnlyMarked,
      env: 'ssr',
    },
  }

  // Bug (Vite): in a build, a violation of a marker (server-only in the
  // client, client-only in the server) only replaces the marker import
  // itself with a mock (`handleViolation` in
  // vite/import-protection-plugin/plugin.ts returns a mock edge for the
  // marker specifier); the marked module keeps its code, and its importers
  // import it. The Rsbuild adapter replaces the module with a mock
  // (self-denial in its import-protection loader). Vite dev mocks the
  // importers' import (see dev.test.ts).
  // Impact: a mock-mode Vite build ships the marked module's real code in
  // the bundle of the environment it is denied to (only a warning is
  // logged).
  // Source: found writing the H2 rows (oracle-gaps REPORT.md); client-only
  // row: round 3 mutation testing (ip-misc P2).
  const markerMockTest = bundler === 'vite' ? test.fails : test
  markerMockTest.each(Object.keys(markedModules))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(markedModules[name]!)).toEqual(mocked)
    },
    timeout,
  )

  // A module that re-exports from a denied specifier is rewritten like a
  // module that imports from it; re-exports of other modules keep their
  // values.
  test(
    're-exports from a denied specifier are mocked; other re-exports keep their values',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'node_modules/denied-pkg/package.json': JSON.stringify({
            name: 'denied-pkg',
            type: 'module',
            main: 'index.js',
            sideEffects: false,
          }),
          'node_modules/denied-pkg/index.js': `export const secret = () => 'MARK_SECRET'\n`,
          'node_modules/safe-pkg/package.json': JSON.stringify({
            name: 'safe-pkg',
            type: 'module',
            main: 'index.js',
          }),
          'node_modules/safe-pkg/index.js': `export const ok = () => 'MARK_SAFE'
export const fine = () => 'MARK_FINE'
`,
          'src/barrel.ts': `export { secret } from 'denied-pkg'\n`,
          'src/mixed.ts': `import { secret as aliased } from 'denied-pkg'
export { ok } from 'safe-pkg'
export * from './fine'
export const s = () => aliased
`,
          'src/fine.ts': `export { fine } from 'safe-pkg'\n`,
          'src/entry.ts': `import { secret } from './barrel'
import { ok, fine, s } from './mixed'
export const read = () => [String(secret), ok(), fine(), String(s())].join(',')
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            client: { specifiers: ['denied-pkg'] },
          },
        },
      })
      expect({
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (await client.run(`return entry.read()`)).result,
      }).toEqual({
        hasRealCode: false,
        read: '[import-protection mock],MARK_SAFE,MARK_FINE,[import-protection mock]',
      })
    },
    timeout,
  )

  // The route module and its split component are two modules of the bundle
  // that import the denied file for the same import of the source.
  // Source: mutation run R4 (spc:5296, 5299).
  test(
    'a denied import of a route used by its loader and its split component is warned once',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          ...routerRuntimeFiles,
          ...deniedModules['a denied file'].files,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
export const Route = createFileRoute('/')({
  loader: () => String(secret()),
  component: () => String(secret()),
})
`,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock' } },
      })
      expect(client.where('MARK_SECRET')).toBe('nowhere')
      expect(reportedViolations(client.warnings)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/routes\/index\.tsx/),
        },
      ])
    },
    timeout,
  )
})

// Bug: `onViolation` runs after the build has replaced the denied module
// (or import) with a mock: Vite substitutes the mock when it resolves the
// import and calls `onViolation` in `generateBundle`
// (vite/import-protection-plugin/plugin.ts `reportOrDeferViolation`);
// Rsbuild mocks in its loader and calls it when reporting in `processAssets`
// (rsbuild/import-protection.ts `reportViolation`). Returning `false` only
// silences the report. (A Vite build of a server-only marker violation keeps
// the real module either way, see the mock-mode pin above.)
// Impact: an import a project allows with `onViolation` (documented:
// "Return false ... to allow this specific import (override the denial)",
// guide/import-protection.md) is a mock in the client: its calls return mocks
// in production, without any warning.
// Source: oracle-gaps H2 / gap IP11 (`onViolation` false only had a recorder).
describe.each(startBundlers)(
  '%s build, onViolation returning false',
  (bundler) => {
    const allowed = { hasRealCode: true, ranReal: true, warnings: [] }
    const allowAll = { importProtection: { onViolation: () => false } }

    test.fails.each(bundler === 'vite' ? ['a denied file'] : deniedModuleNames)(
      'allows the import of %s: the build succeeds and the client gets the real module',
      async (denied) => {
        expect(
          await clientRead(bundler, appUsing(denied as DeniedModule), allowAll),
        ).toEqual(allowed)
      },
      timeout,
    )

    // Control for the pins above (same harness): the build succeeds, and so
    // does a Vite build of a marker violation, whose module is not replaced.
    test.each(
      bundler === 'vite'
        ? ['a denied file', 'a server-only-marked module']
        : deniedModuleNames,
    )(
      'allows the import of %s: the build succeeds',
      async (denied) => {
        const { warnings } = await clientRead(
          bundler,
          appUsing(denied as DeniedModule),
          allowAll,
        )
        expect(warnings).toEqual([])
      },
      timeout,
    )
  },
)

// Which client imports of a server-only-marked module are checked: a
// marker violation is reported for each importer that is in scope and
// compiles, whatever kind of module imports it.
// Source: replaces the Rsbuild "registerImportProtection marker scope" tests
// that ran on a hand-built fake of the Rspack compilation
// (rsbuild/import-protection.test.ts); rubric-start item 25.
describe.each(startBundlers)('%s build, server-only marker', (bundler) => {
  const marked = deniedModules['a server-only-marked module'].files

  test(
    'imported by an ignored importer and another importer fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...marked,
            'src/ignored.ts': `import { secret } from './marked'\nexport const a = () => secret()\n`,
            'src/other.ts': `import { secret } from './marked'\nexport const b = () => secret()\n`,
            'src/entry.ts': `export { a } from './ignored'\nexport { b } from './other'\n`,
          },
          entry: 'src/entry.ts',
          start: { importProtection: { ignoreImporters: ['**/ignored.ts'] } },
        }),
      )
      expect(reportedViolations(error.message)).toHaveLength(1)
    },
    timeout,
  )

  // Bug (Vite): the Vite adapter reports a marker violation for the marked
  // module itself (`importer` is the module importing the marker) and does
  // not look at which modules import it, so `ignoreImporters` cannot exempt
  // them (vite/import-protection-plugin/plugin.ts, marker handling in
  // `resolveId`). The Rsbuild adapter checks the marked module's importers.
  // Impact: on Vite, `ignoreImporters` (documented: "Ignore violations from
  // these importers") does not apply to server-only-marked modules; a build
  // fails for an import the project ignores.
  // Source: found replacing the Rsbuild marker-scope test "skips marker
  // violations imported only by an ignored importer".
  const ignoredOnlyTest = bundler === 'vite' ? test.fails : test
  ignoredOnlyTest(
    'imported only by an ignored importer does not fail the build',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          ...marked,
          'src/ignored.ts': `import { secret } from './marked'\nexport const read = () => secret()\n`,
          'src/entry.ts': `export { read } from './ignored'\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { ignoreImporters: ['**/ignored.ts'] } },
      })
      expect(reportedViolations(client.warnings)).toEqual([])
    },
    timeout,
  )

  test(
    'imported by a split route component fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...routerRuntimeFiles,
            ...marked,
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../marked'
export const Route = createFileRoute('/')({
  component: () => String(secret()),
})
`,
            'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
            'src/entry.ts': `export { getRouter } from './router'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error.message)).toHaveLength(1)
      expect(error.message).toContain('src/routes/index.tsx')
    },
    timeout,
  )

  test(
    'marking the client entry fails the build',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/client.ts': `import '@tanstack/react-start/server-only'
console.log('client')
`,
            'src/entry.ts': `export const read = () => 'entry'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(reportedViolations(error.message)).toEqual([
        {
          environment: 'client',
          importer: expect.stringMatching(/^src\/client\.ts/),
        },
      ])
    },
    timeout,
  )

  test(
    'imported by a module that fails to compile: the build reports the compile error only',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            ...marked,
            'src/broken.ts': `import { secret } from './marked'
export const read = ( => secret()
`,
            'src/entry.ts': `export { read } from './broken'\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expect(error.message).toContain('src/broken.ts')
      expect(reportedViolations(error.message)).toEqual([])
    },
    timeout,
  )
})
