/**
 * What a build reports about where a violation comes from, besides the
 * importer's location (reported-location.test.ts): the import chain from an
 * entry to the importer (SPEC J6.5: any real bounded chain from an entry,
 * printed in any order, SPEC §5.19; each import located on its
 * line in the user's file). Read from Vite and Rsbuild builds with Start's
 * default rules (error mode), as `onViolation` receives it. Split from
 * reported-location.test.ts to keep each file of the slow tier short.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import {
  isAt,
  rejection,
  violationsOf,
} from '../../importProtection/start-apps'
import type { StartBuildOptions, StartBundler } from '../../build-harness'
import type { Violation } from '../../importProtection/start-apps'

const timeout = 60_000

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
): Promise<Violation> {
  const error = await rejection(
    buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      sourcemap,
      viteConfig,
    }),
  )
  const [report, ...others] = violationsOf(error)
  expect(others).toEqual([])
  return report!
}

/** The modules of the steps of `trace`, without their locations. */
const modulesOf = (trace: Violation['trace']) =>
  trace.map(({ at }) => at.replace(/(?::\d+)+$/, ''))

/**
 * The modules a client trace of these apps may start at: the client entry
 * Start builds (the harness's, `harness/client-entry.ts`), or the test's
 * entry module it imports (a trace may leave out modules outside `src`,
 * pinned in "the trace goes through modules outside the source directory").
 */
const clientEntries = ['harness/client-entry.ts', 'src/entry.ts']

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
import { secret } from './secret.server' /* ORIGINAL_IMPORT */
export const leak = () => secret() /* ORIGINAL_USE */
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
 * Whether `importer` is where the `chain` build may report `src/b.ts`: its
 * use of `secret` or its import of the denied module (SPEC J6.5).
 */
const atChainImporter = (importer: string) =>
  ['src/b.ts:4:27', 'src/b.ts:3'].some((place) => isAt(importer, place))

/** `src/b.ts` imports the denied module, and `src/a.ts` imports `b`. */
const leakingB = {
  ...secretServer,
  'src/b.ts': `import { secret } from './secret.server'
export const leak = () => secret()
`,
}

// What a build reports about where a violation comes from: the trace of
// imports from the entry to the importer.
describe.each(startBundlers)(
  '%s build: the report of a violation',
  (bundler) => {
    let chainReport: Promise<Violation> | undefined
    /** The report of the `chain` build, built once. */
    const reportOfChain = () =>
      (chainReport ??= buildReport(bundler, chain, {}))

    // The middle steps are located on the line of their import (which
    // column of the import statement is not specified).
    test(
      'the trace lists each import from the entry, located on its line',
      async () => {
        const { importer, trace } = await reportOfChain()
        expect(atChainImporter(importer), importer).toBe(true)
        // The chain starts at an entry (by its position: no marker needed)
        expect(clientEntries).toContain(modulesOf(trace)[0])
        expect(
          trace.slice(-3).map(({ at, imports }) => ({ at, imports })),
        ).toEqual([
          {
            at: expect.stringMatching(/^src\/entry\.ts:2(?::\d+)?$/),
            imports: './a',
          },
          {
            at: expect.stringMatching(/^src\/a\.ts:3(?::\d+)?$/),
            imports: './b',
          },
          { at: importer, imports: './secret.server' },
        ])
      },
      timeout,
    )

    // Any real chain from the entry to the importer will do, not
    // necessarily the shortest (SPEC J6.5): `src/a.ts` imports
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
    // Source: mutation testing.
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
// Source: mutation testing (route modules taken as entries in the build, as
// full-bundle dev does).
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
// Source: mutation testing (removing that registration changes nothing
// while it registers the wrong path).
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
      // The chain starts at the entry (by its position: no marker needed)
      expect(modulesOf(trace)[0]).toBe('src/client.tsx')
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
    ...movedImportRows('rsbuild', false, [
      'a leading comment',
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
  // Source: mutation testing.
  test.fails.each([
    ...movedImportRows('vite', false, Object.keys(movedImports)),
  ])(
    '$build: after $name',
    async (row) => {
      expect(await stepLine(row)).toBe(row.line)
    },
    timeout,
  )
})
