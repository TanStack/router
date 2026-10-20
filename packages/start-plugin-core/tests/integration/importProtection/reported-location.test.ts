/**
 * Where import protection tells the user a violation is: the location it
 * reports for the importer (`Importer: file:line:column`) should be the use
 * of the denied import that leaks into the environment, in the user's
 * source. Read from what a real app reports with Start's default rules: the
 * Vite dev server's warnings (mock mode), and the errors of an Rsbuild dev
 * server and of Vite and Rsbuild builds (error mode). The Vite and Rsbuild
 * adapters look for the use in a different order (Vite: compiled code first,
 * Rsbuild: original source first), so each case runs on both.
 */
import { describe, expect, test } from 'vitest'
import {
  expectRelevantLocation as expectSharedRelevantLocation,
  findDiagnostics,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import { startRsbuildDevServer } from '../../rsbuild-dev-server'
import {
  distinct,
  expectReportFrame,
  locationIn,
  rejection,
  reportedViolations,
  startProtectedDevServer,
  violationReports,
} from '../../importProtection/start-apps'
import type { StartBuildOptions, StartBundler } from '../../build-harness'
import type {
  ReportOutput,
  ReportedTraceStep,
  ViolationReport,
} from '../../importProtection/violation-report'

const timeout = 60_000

type Channel = 'vite dev' | 'rsbuild dev' | 'vite build' | 'rsbuild build'

/**
 * The importer locations reported for an app whose `src/a.tsx` is `code`
 * (imported by the entry `src/entry.ts`) and imports from the denied
 * `src/secret.server.ts` (none when nothing is reported). JSX compiles
 * with the real React (a dependency of this package).
 */
async function reportedLocations(
  channel: Channel,
  code: string,
): Promise<Array<string>> {
  const files = {
    'src/secret.server.ts': `export const eq = () => 1
export const secret = () => 'secret'
export default function Secret() {
  return 'secret'
}
`,
    'src/a.tsx': code,
    'src/entry.ts': `export * from './a'\n`,
  }
  let output: ReportOutput
  if (channel === 'vite dev') {
    const server = await startProtectedDevServer(files)
    await server.load('/src/entry.ts')
    output = server.logs
  } else if (channel === 'rsbuild dev') {
    const server = await startRsbuildDevServer({
      files,
      importProtection: { behavior: 'error' },
      // Rsbuild's default source maps in development
      config: { output: { sourceMap: { js: 'cheap-module-source-map' } } },
    })
    // (a compile that fails for another reason fails the test)
    const errors = findDiagnostics(server.diagnostics, { severity: 'error' })
    expect(
      errors
        .map(({ text }) => text)
        .filter((error) => !error.includes('[import-protection]')),
    ).toEqual([])
    output = errors
  } else {
    const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
    // (a build without any violation succeeds)
    output = await buildStart({ bundler, files, entry: 'src/entry.ts' }).then(
      ({ client, ssr }) => [...client.warnings, ...ssr.warnings],
      (error: Error) => {
        // (a build that fails for another reason fails the test)
        if (reportedViolations(error.message).length === 0) {
          throw error
        }
        return error.message
      },
    )
  }
  return distinct(reportedViolations(output).map((report) => report.importer))
}

interface LocationCase {
  name: string
  code: string
  /**
   * The genuine surviving uses the report may point at
   * (`src/a.tsx:line:column`, or `src/a.tsx:line` for any column of the
   * line); the static import of the denied module is accepted too
   * (`expectRelevantLocation`).
   */
  expected: Array<string>
}

/**
 * Fails unless one violation is reported, at a relevant place for the
 * violation of the module `file`, whose source is `code` (the shared
 * oracle `expectRelevantLocation`; SPEC J6.5; V1R ip I01): one of the
 * genuine surviving `uses` (`file:line:column`, or `file:line` for any
 * column), or any line of the original import of the denied module. Never
 * a type position, a use inside a removed boundary, an unrelated member
 * named like the import, compiled coordinates, nor no coordinates.
 */
function expectRelevantLocation(
  reported: Array<string>,
  code: string,
  uses: Array<string>,
  file = 'src/a.tsx',
) {
  expect(reported).toHaveLength(1)
  expectSharedRelevantLocation(reported[0]!, {
    file,
    source: code,
    uses: uses.map((use) => {
      const { line, column } = parseLocation(use)
      return { line: line!, column }
    }),
    imports: ['./secret.server', './widget.client'],
  })
}

const at = (code: string, line: number, needle: string) =>
  locationIn('src/a.tsx', code, line, needle)

const afterHandler = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const fn = createServerFn().handler(async () => secret())
export const leak = () => secret()
`

const memberProperty = `import { eq } from './secret.server'
const db = { eq: (n: number) => n }
export const a = db.eq(1)
export const b = eq
`

const typePosition = `import { secret } from './secret.server'
type Secret = typeof secret
export const check = (value: Secret) => value
export const leak = secret
`

const jsxElement = `import Secret from './secret.server'
export const Page = () => <Secret />
`

// A value named like a server fn builder (`*ServerFn`) is not one: the
// client keeps its `handler` callback and the use inside it.
const lookAlike = `import { secret } from './secret.server'
const myServerFn = { handler: (fn: () => unknown) => fn() }
export const fn = myServerFn.handler(() => secret())
`

const isomorphicClient = `import { createIsomorphicFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const fn = createIsomorphicFn().client(() => secret())
`

const unicode =
  "import { secret } from './secret.server'\r\n" +
  '// 👨‍👩‍👧 𝒳𝒴 日本語\r\n' +
  "\texport const label = '🎉'; export const value = () => secret()\r\n"

// (Each shadowing binding is read like the real use, so a lookup that
// prefers calls cannot step over a shadow it does not see: V4 red-astra/19.)
const catchShadow = `import { secret } from './secret.server'
export const run = () => {
  try { return 1 } catch (secret) { console.log(secret) }
}
export const leak = secret
`

const scopeShadow = `import { secret } from './secret.server'
export const inner = (secret: unknown) => secret
export function hoisted() {
  if (Math.random() > 2) {
    var secret = 1
  }
  return secret
}
export const leak = secret
`

const wrappedBoundary = `import { createServerOnlyFn } from '@tanstack/react-start'
import { secret } from './secret.server'
const wrap = <T,>(fn: T) => fn
const run = (fn: () => unknown) => fn()
export const a = createServerOnlyFn(wrap(() => secret()))
export const b = run(() => secret())
`

const dynamicImport = `export const load = () =>
  import('./secret.server', { with: {} })
`

const reExport = `export const one = 1
export { secret } from './secret.server'
`

const cases: Record<string, LocationCase> = {
  afterHandler: {
    name: 'a use after a server fn handler (the handler is not reported)',
    code: afterHandler,
    expected: [at(afterHandler, 4, 'secret()')],
  },
  memberProperty: {
    name: 'a use after a member property named like the import',
    code: memberProperty,
    expected: [at(memberProperty, 4, 'eq')],
  },
  typePosition: {
    name: 'a use after a type position',
    code: typePosition,
    expected: [at(typePosition, 4, 'secret')],
  },
  jsxElement: {
    name: 'a JSX element',
    code: jsxElement,
    expected: [at(jsxElement, 2, '<Secret'), at(jsxElement, 2, 'Secret')],
  },
  lookAlike: {
    name: 'a use inside the handler method of an object named like a server fn',
    code: lookAlike,
    expected: [at(lookAlike, 3, 'secret()')],
  },
  isomorphicClient: {
    name: 'a use inside createIsomorphicFn().client',
    code: isomorphicClient,
    expected: [at(isomorphicClient, 3, 'secret()')],
  },
  // A lone CR is a line terminator, like LF. Source: the #8504 probe (R-11).
  loneCr: {
    name: 'a use after a server fn handler, in a file with lone CR line endings',
    code: afterHandler.replaceAll('\n', '\r'),
    expected: [at(afterHandler, 4, 'secret()')],
  },
  // Ported from the internal usage lookup (V1 ip S24): columns count UTF-16
  // code units (what editors and source maps count) after astral
  // characters, a tab and CRLF line endings.
  unicode: {
    name: 'a use after astral characters and a tab, with CRLF line endings',
    code: unicode,
    expected: [at(unicode, 3, 'secret()')],
  },
  catchShadow: {
    name: 'a use after a catch clause parameter named like the import',
    code: catchShadow,
    expected: [at(catchShadow, 5, 'secret')],
  },
  scopeShadow: {
    name: 'a use after a parameter and a hoisted var named like the import',
    code: scopeShadow,
    expected: [at(scopeShadow, 9, 'secret')],
  },
  // The client compile removes a `createServerOnlyFn(...)` call whatever
  // its argument is, so a use inside a wrapped function is gone (V1 ip
  // S26, replacing the internal pin on the original-source lookup).
  wrappedBoundary: {
    name: 'a use after a createServerOnlyFn whose function is wrapped in a call',
    code: wrappedBoundary,
    expected: [at(wrappedBoundary, 6, 'secret()')],
  },
  // Other import forms (V1 ip S14): the dynamic import (with import
  // attributes) and the re-export are the uses, on their line.
  dynamicImport: {
    name: 'a dynamic import with import attributes',
    code: dynamicImport,
    expected: [`src/a.tsx:2`],
  },
  reExport: {
    name: 'a re-export',
    code: reExport,
    expected: [`src/a.tsx:2`],
  },
}

const channels: Array<Channel> = [
  'vite dev',
  'rsbuild dev',
  'vite build',
  'rsbuild build',
]

/** The rows of `cases` on `channels`. */
const rows = (names: Array<string>, on: Array<Channel>) =>
  names.flatMap((name) => on.map((channel) => ({ ...cases[name]!, channel })))

describe('the reported location of a violation is the leaking use or the import', () => {
  // Source (lookAlike, isomorphicClient): moved from
  // analysis.usage.test.ts, which rebuilt the Vite plugin's location
  // lookup from internals (audit F-H3).
  test.each([
    ...rows(['afterHandler', 'loneCr', 'isomorphicClient'], channels),
    ...rows(['unicode', 'catchShadow', 'scopeShadow', 'reExport'], channels),
    ...rows(['wrappedBoundary', 'dynamicImport'], ['vite dev', 'vite build']),
    ...rows(['lookAlike'], ['vite dev', 'vite build']),
    ...rows(['typePosition', 'jsxElement'], ['vite dev', 'vite build']),
  ])(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(
        await reportedLocations(channel, code),
        code,
        expected,
      )
    },
    timeout,
  )

  // Bug: the usage lookup counts a member property named like a denied import
  // (`db.eq`) as a use of the import (shared `findPostCompileUsagePos` /
  // `findOriginalUnsafeUsagePos` in import-protection/analysis.ts, used by
  // both adapters).
  // Impact: the violation points at an unrelated line, so the user looks for
  // the leak in the wrong place.
  // Source: PR #8504 (analysis.usage.test.ts "ignores a member property named
  // like the import but still finds later usage"); moved from the pin on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(rows(['memberProperty'], channels))(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(
        await reportedLocations(channel, code),
        code,
        expected,
      )
    },
    timeout,
  )

  // NEW bug (Rsbuild): the original-source usage lookup, which the Rsbuild
  // adapter tries first, takes any `<name>ServerFn.handler(...)` callback for
  // a server fn handler by its name (`/ServerFn$/`, `isCompilerSafeBoundaryCall`
  // in import-protection/analysis.ts) and skips the use inside it; the
  // compiled-code lookup it then falls back to reports compiled-code
  // coordinates (the same fallback as the pins below).
  // Impact: on Rsbuild, a violation inside the callback of an object that
  // is only named like a server fn points at a line/column that does not
  // exist in the user's file (here 3:1 in dev, 5:42 in a build).
  // Source: audit F-H3 (moved from analysis.usage.test.ts, which followed
  // the Vite order).
  test.fails.each(rows(['lookAlike'], ['rsbuild dev', 'rsbuild build']))(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(
        await reportedLocations(channel, code),
        code,
        expected,
      )
    },
    timeout,
  )

  // Bug: the original-source usage lookup, which the Rsbuild adapter tries
  // first, counts uses in type positions (`typeof secret`), which TypeScript
  // erases, and does not count a JSX element (`<Secret />`) as a use; the
  // compiled-code lookup it then falls back to reports compiled-code
  // coordinates when the module has no column source map (production builds,
  // and Rsbuild's default `cheap-module-source-map` in development).
  // Impact: on Rsbuild, the violation points at a type annotation, or at a
  // line/column that does not exist in the user's file.
  // Source: PR #8504 (analysis.usage.test.ts "ignores type positions, which
  // TypeScript erases", "finds $name usage"); moved from the pins on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(
    rows(['typePosition', 'jsxElement'], ['rsbuild dev', 'rsbuild build']),
  )(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(
        await reportedLocations(channel, code),
        code,
        expected,
      )
    },
    timeout,
  )

  // Bug (Rsbuild): the original-source usage lookup, which the Rsbuild
  // adapter tries first, skips only functions passed directly to a
  // compiler-safe boundary call (`isInsideCompilerSafeBoundaryNodes`,
  // import-protection/analysis.ts), but the client compile removes the
  // whole `createServerOnlyFn(...)` call, whatever its argument (here a
  // function wrapped in `wrap(...)`), so the use inside it never runs in
  // the client; the lookup reports it (src/a.tsx:5:48) instead of the leak
  // on line 6.
  // Impact: on Rsbuild, the violation points at code the client never runs,
  // not at the leak (location only).
  // Source: mutation round 3 ip-analysis pin P2, reproduced on a real app
  // (V1 ip S26; the internal pin on the lookup is removed).
  //
  // Bug (Rsbuild): a dynamic import of a denied module is reported neither
  // on the line of the `import()` nor at a static import: the dev server
  // reports the first column of the module (src/a.tsx:1:1), a build
  // compiled-code coordinates (src/a.tsx:1:33, a column line 1 does not
  // have).
  // Impact: on Rsbuild, the violation of a lazily loaded denied module
  // points at the wrong line.
  // Source: V1 ip S14 (an input shape the internal index tests had).
  test.fails.each(
    rows(
      ['wrappedBoundary', 'dynamicImport'],
      ['rsbuild dev', 'rsbuild build'],
    ),
  )(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(
        await reportedLocations(channel, code),
        code,
        expected,
      )
    },
    timeout,
  )
})

// A use inside code the Start compiler removes from the client (a safe
// boundary) is not reported: the client no longer imports the denied file.
// Source: moved from analysis.usage.test.ts (audit F-H3), which decided "no
// violation" from the compiled code's imports.
describe('a use inside code the Start compiler removes from the client is not reported', () => {
  const safeUses = {
    'the server of a middleware variable': `import { createMiddleware } from '@tanstack/react-start'
import { secret } from './secret.server'
const authMiddleware = createMiddleware()
export const middleware = authMiddleware.server(({ next }) =>
  next({ context: { secret: secret() } }),
)
`,
    'the handler of a server fn builder variable': `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret.server'
const myServerFn = createServerFn({ method: 'GET' })
export const fn = myServerFn.handler(async () => secret())
`,
  }

  test.each(
    Object.entries(safeUses).flatMap(([name, code]) =>
      channels.map((channel) => ({ name, code, channel })),
    ),
  )(
    '$channel: $name',
    async ({ channel, code }) => {
      expect(await reportedLocations(channel, code)).toEqual([])
    },
    timeout,
  )
})

// The server side: a `.client` file (denied to the server by the default
// rules) used only inside code the Start compiler removes from the server
// (`createClientOnlyFn`) is not reported; a use the server keeps is reported
// on the server, at that use.
// Source: V1 ip S16 (the compiler-removal rows of analysis.usage.test.ts had
// no server-side twin on a real adapter).
describe('the reported location of a server violation is the leaking use or the import', () => {
  type ServerChannel = 'vite dev' | 'vite build' | 'rsbuild build'
  const serverChannels: Array<ServerChannel> = [
    'vite dev',
    'vite build',
    'rsbuild build',
  ]

  const insideOnly = `import { createClientOnlyFn } from '@tanstack/react-start'
import { widget } from './widget.client'
export const fn = createClientOnlyFn(() => widget())
`
  const insideAndOutside = `${insideOnly}export const leak = () => widget()
`

  /**
   * `<environment> <importer>` of each violation reported for an app whose
   * `src/a.ts` is `code` (the server entry re-exports it) and imports the
   * client-only `src/widget.client.ts`.
   */
  async function serverReports(
    channel: ServerChannel,
    code: string,
  ): Promise<Array<string>> {
    const files = {
      'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
      'src/a.ts': code,
      'src/entry.ts': `export * from './a'\n`,
      'src/client.ts': `export const read = () => 'client'\n`,
    }
    let output: string | Array<string>
    if (channel === 'vite dev') {
      const server = await startProtectedDevServer(files)
      await server.load('/src/entry.ts', { environment: 'ssr' })
      output = server.logs
    } else {
      const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
      output = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client.ts', ssr: 'src/entry.ts' },
      }).then(
        ({ client, ssr }) => [...client.warnings, ...ssr.warnings],
        (error: Error) => {
          if (reportedViolations(error.message).length === 0) {
            throw error
          }
          return error.message
        },
      )
    }
    return distinct(
      reportedViolations(output).map(
        ({ environment, importer }) => `${environment} ${importer}`,
      ),
    )
  }

  test.each(serverChannels)(
    '%s: a use outside createClientOnlyFn is reported on the server at the use or the import; the use inside is not',
    async (channel) => {
      const reports = await serverReports(channel, insideAndOutside)
      expect(reports.map((report) => report.split(' ')[0])).toEqual(['server'])
      expectRelevantLocation(
        reports.map((report) => report.split(' ')[1]!),
        insideAndOutside,
        [locationIn('src/a.ts', insideAndOutside, 4, 'widget()')],
        'src/a.ts',
      )
    },
    timeout,
  )

  test.each(serverChannels)(
    '%s: a use only inside createClientOnlyFn is not reported',
    async (channel) => {
      expect(await serverReports(channel, insideOnly)).toEqual([])
    },
    timeout,
  )
})

/**
 * The report of the one violation of a build of `files` (client entry
 * `src/entry.ts`, default rules).
 */
async function buildReport(
  bundler: StartBundler,
  files: Record<string, string>,
  {
    sourcemap = false,
    viteConfig,
  }: Pick<StartBuildOptions, 'sourcemap' | 'viteConfig'> = {},
): Promise<ViolationReport> {
  const error = await rejection(
    buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      sourcemap,
      viteConfig,
    }),
  )
  const [report, ...others] = violationReports(error.message)
  expect(others).toEqual([])
  return report!
}

/** The modules of the steps of `trace`, without their locations. */
const modulesOf = (trace: Array<ReportedTraceStep>) =>
  trace.map(({ at }) => at.replace(/:\d+:\d+$/, ''))

/**
 * The steps of a trace from the app's entry `src/entry.ts` on (a build's
 * trace may start at the harness's own client entry, which imports it).
 */
const fromEntry = (modules: Array<string>) =>
  modules.slice(Math.max(0, modules.indexOf('src/entry.ts')))

/**
 * The real import chains from the entry to `src/s.ts` in the app where
 * `src/a.ts` imports `src/s.ts` directly and through `src/c.ts`.
 */
const realChains = [
  ['src/entry.ts', 'src/a.ts', 'src/s.ts'],
  ['src/entry.ts', 'src/a.ts', 'src/c.ts', 'src/s.ts'],
]

const secretServer = {
  'src/secret.server.ts': `export const secret = () => 'secret'\n`,
}

/**
 * The client entry imports `src/secret.server.ts` through `src/a.ts` and
 * `src/b.ts`, each import after the first line of its module.
 */
const chain = {
  ...secretServer,
  'src/b.ts': `// helper
export const one = 1
import { secret } from './secret.server'
export const leak = () => secret()
`,
  'src/a.ts': `export const two = 2
export const three = 3
import { leak } from './b'
export const page = () => leak()
`,
  'src/entry.ts': `export const zero = 0
export * from './a'
`,
}

/**
 * Where the `chain` build may report `src/b.ts`: its use of `secret` or
 * its import of the denied module (SPEC J6.5).
 */
const chainImporter = {
  file: 'src/b.ts',
  source: chain['src/b.ts'],
  uses: [{ line: 4, column: 27 }],
  imports: ['./secret.server'],
}

/** `src/b.ts` imports the denied module, and `src/a.ts` imports `b`. */
const leakingB = {
  ...secretServer,
  'src/b.ts': `import { secret } from './secret.server'
export const leak = () => secret()
`,
}

// What a build reports about where a violation comes from: the trace of
// imports from the entry to the importer, and the code frame of the use.
describe.each(startBundlers)(
  '%s build: the report of a violation',
  (bundler) => {
    let chainReport: Promise<ViolationReport> | undefined
    /** The report of the `chain` build, built once. */
    const reportOfChain = () =>
      (chainReport ??= buildReport(bundler, chain, {}))

    // The middle steps are located on the line of their import (which
    // column of the import statement is not specified).
    test(
      'the trace lists each import from the entry, located on its line',
      async () => {
        const { importer, trace } = await reportOfChain()
        expectSharedRelevantLocation(importer, chainImporter)
        expect(trace.map(({ entry }) => entry)).toEqual(
          trace.map((_, index) => index === 0),
        )
        expect(
          trace.slice(-3).map(({ at, imports }) => ({ at, imports })),
        ).toEqual([
          {
            at: expect.stringMatching(/^src\/entry\.ts:2:\d+$/),
            imports: './a',
          },
          { at: expect.stringMatching(/^src\/a\.ts:3:\d+$/), imports: './b' },
          { at: importer, imports: './secret.server' },
        ])
      },
      timeout,
    )

    // The frame is at the reported location (the use or the import, SPEC
    // J6.5): it highlights that line of the original source and points at
    // its column; how much context it shows is free (§5.7; V1R ip I01).
    test(
      'the code frame shows the original source at the reported location',
      async () => {
        const report = await reportOfChain()
        expectSharedRelevantLocation(report.importer, chainImporter)
        expectReportFrame(report, chain['src/b.ts'])
      },
      timeout,
    )

    // Any real chain from the entry to the importer will do, not
    // necessarily the shortest (SPEC J6.5; V1 ip S07): `src/a.ts` imports
    // `src/s.ts` directly and through `src/c.ts`.
    test(
      'the trace is a real import chain from the entry to the importer',
      async () => {
        const { trace } = await buildReport(bundler, {
          ...secretServer,
          'src/s.ts': `import { secret } from './secret.server'
export const s = () => secret()
`,
          'src/c.ts': `import { s } from './s'\nexport const c = () => s()\n`,
          'src/a.ts': `import { c } from './c'
import { s } from './s'
export const page = () => c() + s()
`,
          'src/entry.ts': `export * from './a'\n`,
        })
        expect(realChains).toContainEqual(fromEntry(modulesOf(trace)))
      },
      timeout,
    )

    // Bug (Vite): the trace of a Vite build starts at the first module of the
    // trace that is in the source directory and not in `node_modules`: the
    // Vite adapter does not record the imports of other modules in its import
    // graph (vite/import-protection-plugin/plugin.ts). Rsbuild traces through
    // them (and from the harness's client entry, outside `src`).
    // Impact: the trace of a Vite build leaves out how the client reaches the
    // importer when the chain goes through a module outside `src` (a shared
    // directory of a monorepo, a dependency).
    // Source: round 3 mutation testing (ip-location B2).
    const outsideSrcTest = bundler === 'vite' ? test.fails : test
    outsideSrcTest(
      'the trace goes through modules outside the source directory',
      async () => {
        const { trace } = await buildReport(bundler, {
          ...leakingB,
          'shared/a.ts': `import { leak } from '../src/b'
export const page = () => leak()
`,
          'src/entry.ts': `export * from '../shared/a'\n`,
        })
        expect(modulesOf(trace).slice(-3)).toEqual([
          'src/entry.ts',
          'shared/a.ts',
          'src/b.ts',
        ])
      },
      timeout,
    )
  },
)

// An app that sets Vite's full-bundle dev (`experimental.bundledDev`) keeps
// it set for `vite build` (as the e2e apps do with E2E_VITE_BUNDLED_DEV):
// the build's trace does not change.
// Source: r5-gaps N8 (spc:4988, 4989: route modules taken as entries in the
// build, as full-bundle dev does).
test(
  'vite build with experimental.bundledDev: the trace of a violation under a module of src/routes leads from the entry through it',
  async () => {
    const { trace } = await buildReport(
      'vite',
      {
        ...leakingB,
        'src/routes/page.ts': `export { leak } from '../b'\n`,
        'src/entry.ts': `export * from './routes/page'\n`,
      },
      { viteConfig: { experimental: { bundledDev: true } } },
    )
    expect(modulesOf(trace).slice(-3)).toEqual([
      'src/entry.ts',
      'src/routes/page.ts',
      'src/b.ts',
    ])
  },
  timeout,
)

// Bug (Rsbuild): the trace stops at an entry only when it finds no importer
// of the module: in a production build the entry module is a concatenated
// module (scope hoisting), which has no `resourceResolveData`, so the
// Rsbuild adapter registers it by its identifier, the loader request, read
// as the path of the first loader (rsbuild/import-protection.ts
// `addEntryModulesToGraph` → `getModuleResource`), and no module of the
// graph is a registered entry. When a module imports the entry back, the
// trace search finds no root, and the trace is the importer alone, tagged
// as the entry. (A scratch registration of the concatenated module's
// `rootModule` passes this pin.)
// Impact: an Rsbuild build reports such a violation with a one-step trace
// (low: diagnostics only, and an import of the app's entry is rare). Vite is
// right.
// Source: found writing the r5-gaps N10 test (spc:7260, 7261 remove that
// registration, which changes nothing while it registers the wrong path).
describe.each(startBundlers)('%s build', (bundler) => {
  const entryBackTest = bundler === 'rsbuild' ? test.fails : test
  entryBackTest(
    'the trace starts at the entry when a module imports the entry back',
    async () => {
      const { importer, trace } = await buildReport(bundler, {
        ...leakingB,
        // The app's client entry (Start's default `src/client.tsx`)
        'src/client.tsx': `import { page } from './a'
export const start = () => page()
`,
        'src/back.ts': `import * as app from './client'\nexport const back = app\n`,
        'src/a.ts': `import { leak } from './b'
import { back } from './back'
export const page = () => [leak(), back]
`,
        'src/entry.ts': `export * from './a'\n`,
      })
      expect(trace.map(({ entry }) => entry)).toEqual(
        trace.map((_, index) => index === 0),
      )
      expect(modulesOf(trace).slice(-3)).toEqual([
        'src/client.tsx',
        'src/a.ts',
        'src/b.ts',
      ])
      expect(trace.at(-1)!.at).toBe(importer)
    },
    timeout,
  )
})

// The trace locates each import on its line in the user's file, whatever
// compiling the module moves.
const movedImports: Record<
  string,
  { files: Record<string, string>; step: string; line: number }
> = {
  'a leading comment': {
    files: {
      ...leakingB,
      'src/a.ts': `import { leak } from './b'\nexport const page = () => leak()\n`,
      'src/entry.ts': `// entry
export const zero = 0
export * from './a'
`,
    },
    step: 'src/entry.ts',
    line: 3,
  },
  'a blank line': {
    files: {
      ...leakingB,
      'src/a.ts': `export const two = 2

import { leak } from './b'
export const page = () => leak()
`,
      'src/entry.ts': `export * from './a'\n`,
    },
    step: 'src/a.ts',
    line: 3,
  },
  'a type-only import': {
    files: {
      ...leakingB,
      'src/types.ts': `export type Count = number\n`,
      'src/a.ts': `import type { Count } from './types'
export const count: Count = 1
import { leak } from './b'
export const page = () => leak() + count
`,
      'src/entry.ts': `export * from './a'\n`,
    },
    step: 'src/a.ts',
    line: 3,
  },
}

/** The rows of `movedImports` named `names`, built with `bundler`. */
const movedImportRows = (
  bundler: StartBundler,
  sourcemap: boolean,
  names: Array<string>,
) =>
  names.map((name) => ({
    name,
    build: `${bundler} build${sourcemap ? ' with source maps' : ''}`,
    bundler,
    sourcemap,
    ...movedImports[name]!,
  }))

describe('the trace locates each import on its line after compiling moved it', () => {
  async function stepLine({
    bundler,
    sourcemap,
    files,
    step,
  }: ReturnType<typeof movedImportRows>[number]) {
    const { trace } = await buildReport(bundler, files, { sourcemap })
    const at = trace.find((candidate) => candidate.at.startsWith(`${step}:`))
    return Number(at?.at.split(':')[1])
  }

  test.each([
    ...movedImportRows('rsbuild', true, Object.keys(movedImports)),
    ...movedImportRows('rsbuild', false, ['a leading comment']),
  ])(
    '$build: after $name',
    async (row) => {
      expect(await stepLine(row)).toBe(row.line)
    },
    timeout,
  )

  // Bug: a trace step's location is the import's position in the compiled
  // code of the module unless import protection captured a source map of
  // it: the Vite adapter captures one only for modules whose code names a
  // denied file or specifier pattern or a marker
  // (`shouldCaptureDiagnosticSourceMap` in
  // vite/import-protection-plugin/plugin.ts), the Rsbuild adapter only when
  // the build emits source maps. Compiling drops comments (Vite), blank
  // lines and type-only imports, which moves the imports after them up.
  // Impact: the trace points at the wrong line of the modules between the
  // entry and the importer.
  // Source: round 3 mutation testing (ip-location B1).
  test.fails.each([
    ...movedImportRows('vite', false, Object.keys(movedImports)),
    ...movedImportRows('rsbuild', false, [
      'a blank line',
      'a type-only import',
    ]),
  ])(
    '$build: after $name',
    async (row) => {
      expect(await stepLine(row)).toBe(row.line)
    },
    timeout,
  )
})
