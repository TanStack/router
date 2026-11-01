/**
 * Import protection in a real Start build (Vite and Rsbuild), continued
 * from build.test.ts (three files with build-markers.test.ts, to keep each
 * within the per-file time budget): mock mode. A mock is told by what it does (`mock-helpers.ts`,
 * `describeValue`: `a safe mock`), and a violation by what `onViolation`
 * receives.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../../build-harness'
import {
  describeValuePrelude,
  mockAccessDiagnostics,
} from '../../importProtection/mock-helpers'
import {
  distinct,
  expectViolationsAt,
  inEnvironment,
  locationIn,
  reportedViolations,
  starReexportApps,
} from '../../importProtection/start-apps'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'

const timeout = 60_000

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

/** A client-only module (denied to the server by its marker). */
const clientOnlyMarked = {
  'src/marked.ts': `import '@tanstack/react-start/client-only'
export const secret = () => 'MARK_SECRET'
`,
}

/**
 * `files` with each module recording that it ran (`globalThis.secretLoaded`),
 * after its marker import when it has one. For the mock-mode rows: a mock
 * runs no initializer of the denied module. (A side effect keeps a module
 * in a bundle, so the tree-shaking rows use the modules as they are.)
 */
function recording(files: Record<string, string>): Record<string, string> {
  const record = `;(globalThis as any).secretLoaded = 'MARK_SECRET_LOADED'\n`
  return Object.fromEntries(
    Object.entries(files).map(([file, code]) => {
      if (!/\.[cm]?[jt]sx?$/.test(file) || code.includes('secretLoaded')) {
        return [file, code]
      }
      return [
        file,
        code.startsWith('import ')
          ? code.replace('\n', `\n${record}`)
          : record + code,
      ]
    }),
  )
}

// `behavior: 'mock'` builds: a denied import is replaced with a mock (and
// a warning); the real module's code stays out of the bundle and its
// initializer never runs; `mockAccess` says whether using the mock is
// reported in the console (SPEC J6.3: it applies wherever a mock is served,
// a production build included; `off` for silence).
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
   * build with `mockAccess`: whether the violation was reported (to
   * `onViolation`, and printed as a warning at the importer's line of the
   * import or of its use, or at a marked module's marker: SPEC J6.3,
   * J6.5, J6.12), whether the real code is in the bundle and its
   * initializer ran, what the import is (`a safe mock`), the severities of
   * what using it (a call) logged to the console, and the texts of those
   * that do not name the denied import (`mockAccessDiagnostics`; their
   * prose is free).
   */
  async function mockedRead(
    denied: MockedImport,
    mockAccess: 'error' | 'warn' | 'off' | undefined,
  ) {
    const env = denied.env ?? 'client'
    const built = await buildStart({
      bundler,
      files: {
        ...recording(denied.files),
        'src/entry.ts': `${denied.imports ?? ''}import { secret } from '${denied.importedAs}'
export const read = () => secret
`,
        'src/other.ts': `export const read = () => 'other'\n`,
      },
      entry:
        env === 'client'
          ? 'src/entry.ts'
          : { client: 'src/other.ts', ssr: 'src/entry.ts' },
      start: { importProtection: { behavior: 'mock', mockAccess } },
    })
    const { result } = await built[env].run(`${describeValuePrelude}
const logged = []
for (const level of ['warn', 'error']) {
  console[level] = (...args) => {
    logged.push({
      level,
      text: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
    })
  }
}
const secret = entry.read()
const read = describeValue(secret, 'MARK_SECRET')
secret()
return { read, ran: globalThis.secretLoaded ?? null, logged }`)
    const { read, ran, logged } = result as {
      read: string
      ran: unknown
      logged: Array<{ level: 'warn' | 'error'; text: string }>
    }
    const diagnostics = logged.flatMap(({ level, text }) =>
      diagnosticsOf(text, level === 'warn' ? 'warning' : 'error'),
    )
    const deniedFile = Object.keys(denied.files).find((file) =>
      /\.[cm]?[jt]sx?$/.test(file),
    )
    const identified = (diagnostic: Diagnostic) =>
      mockAccessDiagnostics([diagnostic], {
        severity: diagnostic.severity,
        specifier: denied.importedAs,
        file: deniedFile,
      }).length > 0
    // `src/entry.ts`: the other imports, then the import and its use
    const importLine = (denied.imports ?? '').split('\n').length
    const printedAt = [
      { file: 'src/entry.ts', line: importLine },
      { file: 'src/entry.ts', line: importLine + 1 },
      ...Object.entries(denied.files)
        .filter(([, code]) => code.startsWith(`import '@tanstack/react-start/`))
        .map(([file]) => ({ file, line: 1 })),
    ]
    return {
      warned:
        reportedViolations(
          inEnvironment(built, env === 'ssr' ? 'server' : 'client'),
        ).length > 0 &&
        printedAt.some(
          ({ file, line }) =>
            findDiagnostics(built.diagnostics, {
              severity: 'warning',
              file,
              root: built.root,
              position: { line },
            }).length > 0,
        ),
      hasRealCode: built[env].where('MARK_SECRET') !== 'nowhere',
      ran,
      read,
      /** The console severities a use of the mock logged with, each once. */
      loggedWith: distinct(diagnostics.map(({ severity }) => severity)),
      /** What it logged that does not name the denied import. */
      unidentified: diagnostics
        .filter((diagnostic) => !identified(diagnostic))
        .map(({ text }) => text),
    }
  }

  /** A safe mock, silent with `mockAccess: 'off'`; the build warns. */
  const mocked = {
    warned: true,
    hasRealCode: false,
    ran: null,
    read: 'a safe mock',
    loggedWith: [],
    unidentified: [],
  }

  const deniedFile = (extension: string): MockedImport => ({
    importedAs: `./secret.server.${extension}`,
    files: {
      [`src/secret.server.${extension}`]: `globalThis.secretLoaded = 'MARK_SECRET_LOADED'
export const secret = () => 'MARK_SECRET'
`,
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
    'a denied .client file imported by the server': {
      importedAs: './widget.client',
      files: {
        'src/widget.client.ts': `export const secret = () => 'MARK_SECRET'\n`,
      },
      env: 'ssr',
    },
  }

  test.each(Object.keys(deniedFiles))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(deniedFiles[name]!, 'off')).toEqual(mocked)
    },
    timeout,
  )

  // Bug: a mock-mode build serves self-contained mocks that never report
  // their use (`generateSelfContainedMockModule`, import-protection/
  // virtualModules.ts; the Vite transform's `isBuild` branch and the Rsbuild
  // loader), whatever `mockAccess` says; only dev mocks carry the runtime
  // diagnostic (`mockRuntimeModuleIdFromViolation`). `mockAccess` is
  // documented for `behavior: 'mock'` without a dev restriction
  // (schema.ts), and SPEC J6.3 applies it wherever a mock is served.
  // Impact: in a production build with `behavior: { build: 'mock' }`, code
  // that runs on a mocked import does so without any console diagnostic;
  // the warning at build time is the only trace of it.
  // Source: review (the rows above demanded silence with the default); the
  // server rows: SPEC J6.3 (mock mode always logs: client and server, dev
  // and build).
  test.each(
    (
      [
        { mockAccess: undefined, severity: 'error' },
        { mockAccess: 'error', severity: 'error' },
        { mockAccess: 'warn', severity: 'warning' },
      ] as const
    ).flatMap((row) => [
      { ...row, denied: 'a denied file' },
      { ...row, denied: 'a denied .client file imported by the server' },
    ]),
  )(
    'with mockAccess $mockAccess, using the mock of $denied is reported as an $severity naming the import',
    async ({ mockAccess, severity, denied }) => {
      expect(await mockedRead(deniedFiles[denied]!, mockAccess)).toEqual({
        ...mocked,
        loggedWith: [severity],
      })
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
  // the bundle of the environment it is denied to, and runs it (only a
  // warning is logged).
  // Source: review; client-only row: mutation testing.
  // (Was a Vite pin; the Yuku host substitutes every importer's edge.)
  const markerMockTest = test
  markerMockTest.each(Object.keys(markedModules))(
    '%s is mocked, with a warning',
    async (name) => {
      expect(await mockedRead(markedModules[name]!, 'off')).toEqual(mocked)
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
export const read = () => [secret, ok(), fine(), s()]
`,
        },
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            client: { specifiers: ['denied-pkg'] },
          },
        },
      })
      expect({
        hasRealCode: client.where('MARK_SECRET') !== 'nowhere',
        read: (
          await client.run(`${describeValuePrelude}
return entry.read().map((value) => describeValue(value, 'MARK_SECRET'))`)
        ).result,
      }).toEqual({
        hasRealCode: false,
        read: ['a safe mock', 'MARK_SAFE', 'MARK_FINE', 'a safe mock'],
      })
    },
    timeout,
  )

  // SPEC J6.8 (`export *` of a denied module): in a
  // mock-mode build, a name a client module re-exports with `export *` from
  // a denied module is a safe mock and the denied module's value is not in
  // the bundle, or the build fails.
  async function expectStarReexportMockedOrBuildFails({
    files,
    importProtection,
  }: (typeof starReexportApps)[number]) {
    const built = await buildStart({
      bundler,
      files,
      entry: 'src/c.ts',
      start: {
        importProtection: {
          ...importProtection,
          behavior: 'mock',
          mockAccess: 'off',
        },
      },
    }).catch((error: unknown) => {
      if (error instanceof StartBuildError) {
        return 'the build fails' as const
      }
      throw error
    })
    if (built === 'the build fails') {
      return
    }
    expect({
      secret: built.client.where('MARK_SECRET'),
      v: (
        await built.client.run(`${describeValuePrelude}
return describeValue(entry.v, 'MARK_SECRET')`)
      ).result,
    }).toEqual({ secret: 'nowhere', v: 'a safe mock' })
  }
  const starApp = (name: string) =>
    starReexportApps.find((app) => app.name === name)!
  test(
    'a name re-exported with `export *` from a denied file is a safe mock, or the build fails',
    () => expectStarReexportMockedOrBuildFails(starApp('a denied file')),
    timeout,
  )
  // Bug (Rsbuild): the import-protection loader removes an `export * from` a
  // denied specifier from the importer (today's `rewriteDeniedImports`), and
  // the build of the module importing a name of it succeeds without that
  // name. (Vite's build fails on the missing export, which SPEC J6.8
  // accepts.)
  // Impact: a mock-mode Rsbuild build ships a client in which a name
  // re-exported with `export *` from a denied package is `undefined`: using
  // it throws instead of reaching a mock.
  // Source: SPEC J6.8, the build row of the dev pin in
  // known-bugs-dev-server.test.ts.
  test(
    'a name re-exported with `export *` from a denied specifier is a safe mock, or the build fails',
    () => expectStarReexportMockedOrBuildFails(starApp('a denied specifier')),
    timeout,
  )

  // The route module and its split component are two modules of the bundle
  // that import the denied file for the same import of the source.
  // Source: mutation testing.
  test(
    'a denied import of a route used by its loader and its split component is warned once',
    async () => {
      const route = `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../secret.server'
export const Route = createFileRoute('/')({
  loader: () => String(secret()),
  component: () => String(secret()),
})
`
      const build = await buildStart({
        bundler,
        files: {
          ...deniedModules['a denied file'].files,
          'src/routes/index.tsx': route,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock' } },
      })
      expect(build.client.where('MARK_SECRET')).toBe('nowhere')
      // One warning printed, naming the route file
      expectDiagnostic(build.diagnostics, {
        severity: 'warning',
        file: 'src/routes/index.tsx',
        root: build.root,
        times: 1,
      })
      // At either use or at the import (SPEC J6.5)
      expectViolationsAt(inEnvironment(build, 'client'), [
        {
          environment: 'client',
          use: locationIn('src/routes/index.tsx', route, 4, 'secret()'),
          also: [
            locationIn('src/routes/index.tsx', route, 5, 'secret()'),
            'src/routes/index.tsx:2',
          ],
        },
      ])
    },
    timeout,
  )
})
