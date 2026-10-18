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
import { buildStart, startBundlers } from '../build-harness'
import { startRsbuildDevServer } from '../rsbuild-dev-server'
import {
  distinct,
  locationIn,
  reactRuntimeFiles,
  rejection,
  reportedViolations,
  startProtectedDevServer,
} from './start-apps'
import { violationReports } from './violation-report'
import type { StartBuildOptions, StartBundler } from '../build-harness'
import type { ReportedTraceStep, ViolationReport } from './violation-report'

const timeout = 60_000

type Channel = 'vite dev' | 'rsbuild dev' | 'vite build' | 'rsbuild build'

/**
 * The importer locations reported for an app whose `src/a.tsx` is `code`
 * (imported by the entry `src/entry.ts`) and imports from the denied
 * `src/secret.server.ts`.
 */
async function reportedLocations(
  channel: Channel,
  code: string,
): Promise<Array<string>> {
  const files = {
    ...reactRuntimeFiles,
    'src/secret.server.ts': `export const eq = () => 1
export const secret = () => 'secret'
export default function Secret() {
  return 'secret'
}
`,
    'src/a.tsx': code,
    'src/entry.ts': `export * from './a'\n`,
  }
  let output: string | Array<string>
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
    output = server.errors
  } else {
    const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
    output = (
      await rejection(buildStart({ bundler, files, entry: 'src/entry.ts' }))
    ).message
  }
  return distinct(reportedViolations(output).map((report) => report.importer))
}

interface LocationCase {
  name: string
  code: string
  /** The locations the report may point at (`src/a.tsx:line:column`). */
  expected: Array<string>
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
  // A lone CR is a line terminator, like LF. Source: the #8504 probe (R-11).
  loneCr: {
    name: 'a use after a server fn handler, in a file with lone CR line endings',
    code: afterHandler.replaceAll('\n', '\r'),
    expected: [at(afterHandler, 4, 'secret()')],
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

describe('the reported location of a violation is the leaking use', () => {
  test.each([
    ...rows(['afterHandler', 'loneCr'], channels),
    ...rows(['typePosition', 'jsxElement'], ['vite dev', 'vite build']),
  ])(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
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
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
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
      const reported = await reportedLocations(channel, code)
      expect(reported).toHaveLength(1)
      expect(expected).toContain(reported[0])
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

    test(
      'the trace lists each import from the entry, located at its specifier',
      async () => {
        const { importer, trace } = await reportOfChain()
        expect(importer).toBe('src/b.ts:4:27')
        expect(trace.map(({ entry }) => entry)).toEqual(
          trace.map((_, index) => index === 0),
        )
        expect(
          trace.slice(-3).map(({ at, imports }) => ({ at, imports })),
        ).toEqual([
          { at: 'src/entry.ts:2:16', imports: './a' },
          { at: 'src/a.ts:3:23', imports: './b' },
          { at: 'src/b.ts:4:27', imports: './secret.server' },
        ])
      },
      timeout,
    )

    test(
      'the code frame shows the import and the use, pointing at the use',
      async () => {
        expect((await reportOfChain()).code).toEqual({
          line: 4,
          pointsAt: 'secret()',
          shows: expect.arrayContaining([
            `import { secret } from './secret.server'`,
            'export const leak = () => secret()',
          ]),
          location: 'src/b.ts:4:27',
        })
      },
      timeout,
    )

    test(
      'the trace is the shortest import chain',
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
        expect(modulesOf(trace).slice(-3)).toEqual([
          'src/entry.ts',
          'src/a.ts',
          'src/s.ts',
        ])
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
        'src/back.ts': `import * as app from '../harness/client-entry'\nexport const back = app\n`,
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
        'src/entry.ts',
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
