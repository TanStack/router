import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  runRsbuildClient,
  startBrowserRsbuildDevServer as startRsbuildDevServer,
} from '../importProtection/client-pages'
import { runRsbuildSsr, ssrNodeOutput } from '../importProtection/v2-hosts'
import { buildStart } from '../../build-harness'
import {
  describeValuePrelude,
  expectMockAccess,
} from '../../importProtection/mock-helpers'
import {
  distinct,
  expectMarkerViolation,
  expectPrinted,
  expectViolationsAt,
  isAt,
  locationIn,
  receivedViolations,
  rejection,
  relevantViolations,
  reportedViolations,
  violationLabel,
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { originalLocation } from '../../importProtection/original-location'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { StartBuildError } from '../../build-harness'
import type { ExpectedViolation } from '../../importProtection/start-apps'
import type {
  ImportProtectionOptions,
  ViolationInfo,
} from '../../importProtection/public-types'

/**
 * Each test's timeout, and the time an Rsbuild dev server may take to
 * compile: only a guard against a compile that never comes, never shorter
 * than the test's own timeout (a slow compile on a loaded machine fails the
 * test by its timeout, not by a shorter deadline of the harness).
 */

const timeout = 60_000
const compileTimeout = timeout

// One dev server for every importer: a client module of each JavaScript and
// TypeScript type imports the same `.server` file.
describe('Rsbuild dev: a client module importing a .server file', () => {
  const esm = `import { secret } from './secret.server.js'
export const page = () => secret
`
  const commonJs = `const { secret } = require('./secret.server.js')
exports.page = () => secret
`
  const importers = [
    { extension: 'ts', page: esm },
    { extension: 'js', page: esm },
    { extension: 'jsx', page: esm },
    { extension: 'mjs', page: esm },
    { extension: 'cjs', page: commonJs },
    { extension: 'mts', page: esm },
    { extension: 'cts', page: commonJs },
  ]

  let violations: Array<ViolationInfo>
  let server: RsbuildDevServer
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())
  beforeAll(async () => {
    violations = []
    server = await startRsbuildDevServer({
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
      compileTimeout,
      importProtection: {
        onViolation: (info) => {
          violations.push(info as ViolationInfo)
        },
      },
      files: {
        'src/secret.server.js': `export const secret = 'MARK_SERVER_SECRET'\n`,
        ...Object.fromEntries(
          importers.map(({ extension, page }) => [
            `src/page.${extension}`,
            page,
          ]),
        ),
        'src/entry.ts': importers
          .map(
            ({ extension }) =>
              `import { page as ${extension} } from './page.${extension}'\nconsole.log(${extension}())\n`,
          )
          .join(''),
      },
    })
  }, timeout)

  test('the compile succeeds, without the real module', async () => {
    expect(server.errors).toEqual([])
    expect(Object.values(await server.outputs()).join('\n')).not.toContain(
      'MARK_SERVER_SECRET',
    )
  })

  test.each(importers)(
    'is reported when it is a .$extension file',
    ({ extension }) => {
      expect(
        violations
          .filter((info) => info.importer.endsWith(`/src/page.${extension}`))
          .map((info) => ({
            type: info.type,
            importer: path.relative(server.root, info.importer),
            specifier: info.specifier,
          })),
      ).toEqual([
        {
          type: 'file',
          importer: `src/page.${extension}`,
          specifier: './secret.server.js',
        },
      ])
    },
  )
})

// With Start's whole Rsbuild plugin, import protection runs in the server
// environment too: Start's default rules deny `*.client.*` files to it.
// Source: review (the other Rsbuild dev tests run import protection on the
// client environment only).
test(
  'Rsbuild dev with Start: a server import of a .client file is mocked on the server and reported',
  async () => {
    const recorder = violationRecorder()
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      start: { importProtection: recorder.importProtection },
      files: {
        'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
        'src/entry.ts': `import { widget } from './widget.client'
export const read = () => widget()
console.log(read())
`,
      },
    })
    expect(server.errors).toEqual([])
    expect(receivedViolations(recorder.violations, server.root)).toEqual([
      originalLocation('server src/entry.ts:2:27', 1),
    ])
    // Printed as a warning at the importer's line of the import or of its
    // use (SPEC J6.3, J6.12)
    expect(
      [1, 2].some(
        (line) =>
          findDiagnostics(server.diagnostics, {
            severity: 'warning',
            file: 'src/entry.ts',
            root: server.root,
            position: { line },
          }).length > 0,
      ),
      'a printed warning at src/entry.ts:1 or :2',
    ).toBe(true)
    const code = async (environment: string) =>
      Object.values(await server.outputs(environment)).join('\n')
    expect(await code('ssr')).not.toContain('MARK_CLIENT')
    expect(await code('client')).toContain('MARK_CLIENT')
  },
  timeout,
)

// `mockAccess` applies wherever a mock is served, the server environments of
// a dev server included (SPEC J6.3: mock mode always
// logs): the SSR mock of a `.client` file reports its use in the server
// console as configured.
describe('Rsbuild dev with Start: an SSR import of a .client file: mockAccess', () => {
  /**
   * Runs the SSR output of a dev server with `mockAccess` in a child Node
   * process and calls the mocked `widget`: what it is, and what the call
   * logged, as warnings and errors.
   */
  async function useOnTheServer(
    mockAccess: NonNullable<ImportProtectionOptions>['mockAccess'],
  ) {
    const recorder = violationRecorder({ mockAccess })
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      config: ssrNodeOutput,
      start: { importProtection: recorder.importProtection },
      files: {
        'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
        'src/entry.ts': `import { widget } from './widget.client'
export const read = () => widget()
;(globalThis as Record<string, unknown>).read = read
`,
      },
    })
    expect(server.errors).toEqual([])
    expect(reportedViolations({ root: server.root, ...recorder })).toEqual([
      expect.objectContaining({ environment: 'server' }),
    ])
    const ran = await runRsbuildSsr(
      server,
      `${describeValuePrelude}
const logged = []
for (const level of ['warn', 'error']) {
  console[level] = (...args) => logged.push({
    severity: level === 'warn' ? 'warning' : 'error',
    raw: args.map(String),
    text: args.map((arg) => arg instanceof Error ? arg.message : String(arg)).join(' '),
  })
}
return { read: describeValue(globalThis.read(), 'MARK_'), logged }`,
    )
    expect(ran).toEqual({ result: expect.anything() })
    return (ran as { result: { read: string; logged: Array<Diagnostic> } })
      .result
  }

  test.each([
    { mockAccess: undefined, severity: 'error' },
    { mockAccess: 'error', severity: 'error' },
    { mockAccess: 'warn', severity: 'warning' },
  ] as const)(
    '$mockAccess: the server gets a safe mock, and using it is reported as an $severity naming the import',
    async ({ mockAccess, severity }) => {
      const { read, logged } = await useOnTheServer(mockAccess)
      expect(read).toBe('a safe mock')
      expect(distinct(logged.map((diagnostic) => diagnostic.severity))).toEqual(
        [severity],
      )
      expectMockAccess(logged, {
        severity,
        specifier: './widget.client',
        file: 'src/widget.client.ts',
      })
    },
    timeout,
  )

  test(
    'off: the server gets a safe mock, and using it is not reported',
    async () => {
      expect(await useOnTheServer('off')).toEqual({
        read: 'a safe mock',
        logged: [],
      })
    },
    timeout,
  )
})

// Source: mutation testing (Rsbuild host, `behavior` in dev).
describe('Rsbuild dev: behavior', () => {
  test.each<{
    behavior: NonNullable<ImportProtectionOptions>['behavior']
    reportedAs: 'warnings' | 'errors'
  }>([
    { behavior: undefined, reportedAs: 'warnings' },
    { behavior: { build: 'mock' }, reportedAs: 'warnings' },
    { behavior: { dev: 'error' }, reportedAs: 'errors' },
  ])(
    '$behavior: a violation is reported in the compile $reportedAs',
    async ({ behavior, reportedAs }) => {
      const entry = `import { secret } from './secret.server'
console.log(secret())
`
      const recorder = violationRecorder({ behavior })
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        files: {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/entry.ts': entry,
        },
      })
      const recorded = { root: server.root, ...recorder }
      const [violation, ...others] = violationsOf(recorded)
      expect(others).toEqual([])
      expectViolationsAt(recorded, [
        {
          environment: 'client',
          use: locationIn('src/entry.ts', entry, 2, 'secret()'),
          also: ['src/entry.ts:1'],
        },
      ])
      // Printed with the severity, naming the importer at its position
      const severityOf = { warnings: 'warning', errors: 'error' } as const
      const other = reportedAs === 'errors' ? 'warnings' : 'errors'
      expectPrinted(
        server.diagnostics,
        server.root,
        violation!,
        severityOf[reportedAs],
      )
      expect(
        findDiagnostics(server.diagnostics, {
          severity: severityOf[other],
          file: 'src/entry.ts',
          root: server.root,
        }),
      ).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev: reports across rebuilds', () => {
  /** An entry using the denied file `src/secret.server.ts` and `src/other.ts`. */
  const app = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/other.ts': `export const other = 1\n`,
    'src/entry.ts': `import { secret } from './secret.server'
import { other } from './other'
console.log(secret(), other)
`,
  }

  // Source: mutation testing; a control of the harness running
  // an Rsbuild dev rebuild with import protection on (the warnings of each
  // compile).
  /** The violation: the use of `secret` in the entry (or its import). */
  const violation: ExpectedViolation = {
    environment: 'client',
    use: locationIn('src/entry.ts', app['src/entry.ts'], 3, 'secret()'),
    also: ['src/entry.ts:1'],
  }

  test.each([
    { log: 'once' as const, afterRebuild: [] },
    { log: 'always' as const, afterRebuild: [violationLabel(violation)] },
  ])(
    "log '$log': a rebuild for an unrelated edit reports $afterRebuild",
    async ({ log, afterRebuild }) => {
      const recorder = violationRecorder({ log })
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        files: app,
      })
      // Which violations the compiles since `since` report (a dev server
      // may compile more than once for one edit; the same violation in each
      // counts once).
      const reported = (since: number) =>
        relevantViolations(
          {
            root: server.root,
            violations: recorder.violations.slice(since),
          },
          [violation],
        )
      expect(reported(0)).toEqual([violationLabel(violation)])
      const since = recorder.violations.length
      await server.edit({ 'src/other.ts': `export const other = 2\n` })
      expect(server.rebuilt).toContain('src/other.ts')
      expect(reported(since)).toEqual(afterRebuild)
    },
    timeout,
  )

  // The compile ends (import protection does not hang on a module that is
  // gone) with an error (SPEC G5; the module-not-found error names the
  // importer's directory and the specifier, no file and position SPEC §5.7
  // checks).
  // Source: mutation testing (Rsbuild host, entries without a module).
  test.each([
    { module: 'the entry module', file: 'src/entry.ts' },
    { module: 'an imported module', file: 'src/other.ts' },
  ])(
    'a compile in which $module is missing fails',
    async ({ file }) => {
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: {},
        files: app,
      })
      const since = server.diagnostics.length
      await server.edit({ [file]: null })
      const errors = findDiagnostics(server.diagnostics.slice(since), {
        severity: 'error',
      })
      expect(errors).not.toEqual([])
    },
    timeout,
  )

  // Source: mutation testing (the resolve cache of a previous compile).
  test(
    'a denied specifier that an edit makes resolve elsewhere is reported again, never with its old target',
    async () => {
      const resolved: Array<string | undefined> = []
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: {
          client: { specifiers: [/^\.\/lib$/] },
          onViolation: (info) => {
            // relative to the app root (src/...)
            resolved.push(
              (info as ViolationInfo).resolved?.replace(/^.*\/(?=src\/)/, ''),
            )
          },
        },
        files: {
          'src/lib.ts': `export const lib = 1\n`,
          'src/entry.ts': `import { lib } from './lib'\nconsole.log(lib)\n`,
        },
      })
      // `resolved` is optional for a specifier violation (SPEC J6.5,
      // §5.14): what is checked is a resolved path when one is given.
      expect(resolved).toHaveLength(1)
      expect([undefined, 'src/lib.ts']).toContain(resolved[0])
      await server.edit({
        'src/lib.ts': null,
        'src/lib/index.ts': `export const lib = 2\n`,
        'src/entry.ts': `import { lib } from './lib'\nconsole.log(lib, 2)\n`,
      })
      // The edit passes through states the dev server may compile and
      // report: `./lib` resolving nowhere (`undefined`) once `src/lib.ts` is
      // gone and before `src/lib/index.ts` exists (SPEC §8). The violation is reported
      // again; every resolved path given since the edit is the new target,
      // never the old one, and a compiler that gave one before the edit
      // reports the new target last.
      const sinceEdit = resolved.slice(1)
      expect(sinceEdit).not.toEqual([])
      const given = sinceEdit.filter((target) => target !== undefined)
      expect(given).toEqual(given.map(() => 'src/lib/index.ts'))
      if (resolved[0] !== undefined) {
        expect(sinceEdit.at(-1)).toBe('src/lib/index.ts')
      }
    },
    timeout,
  )
})

// Dev edits reclassify (SPEC J6.13): an edit that makes a module the
// client already bundles a violation is reported and mocked, without an
// edit of the importer when the violation comes from the target.
// Source: upstream #8801 (Rsbuild dev import protection after edits).
describe('Rsbuild dev: an edit that makes an import a violation', () => {
  const marker = `import '@tanstack/react-start/server-only'\n`
  /** `src/a.ts` uses `widget` of `src/b.ts`, which starts with `head`. */
  const markedApp = (head: string) => ({
    'src/b.ts': `${head}export const widget = () => 'MARK_B_CODE'\n`,
    'src/a.ts': `import { widget } from './b'
export const read = () => widget()
`,
    'src/entry.ts': `import { read } from './a'\nconsole.log(read())\n`,
  })
  /** The use of `widget` in `src/a.ts`, its import, or the marker. */
  const markerViolation: ExpectedViolation = {
    environment: 'client',
    use: 'src/a.ts:2:27',
    also: ['src/a.ts:1', 'src/b.ts:1'],
  }
  const clientCode = async (server: RsbuildDevServer) =>
    Object.values(await server.outputs()).join('\n')

  test(
    'a new import of a .server file in a module the client bundles is reported and mocked',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        files: {
          'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
          'src/a.ts': `export const read = () => 'MARK_A'\n`,
          'src/entry.ts': `import { read } from './a'\nconsole.log(read())\n`,
        },
      })
      expect(server.errors).toEqual([])
      expect(recorder.violations).toEqual([])
      const a = `import { secret } from './secret.server'
export const read = () => secret()
`
      await server.edit({ 'src/a.ts': a })
      expect(server.errors).toEqual([])
      expect(
        relevantViolations({ root: server.root, ...recorder }, [
          {
            environment: 'client',
            use: locationIn('src/a.ts', a, 2, 'secret()'),
            also: ['src/a.ts:1'],
          },
        ]),
      ).toEqual([`client ${locationIn('src/a.ts', a, 2, 'secret()')}`])
      expect(await clientCode(server)).not.toContain('MARK_SECRET')
    },
    timeout,
  )

  test(
    'an edit that marks an imported module server-only, the importer unchanged, is reported and the importer gets the mock',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        files: markedApp(''),
      })
      expect(server.errors).toEqual([])
      expect(recorder.violations).toEqual([])
      expect(await clientCode(server)).toContain('MARK_B_CODE')
      await server.edit({ 'src/b.ts': markedApp(marker)['src/b.ts'] })
      expect(server.errors).toEqual([])
      expect(
        relevantViolations({ root: server.root, ...recorder }, [
          markerViolation,
        ]),
      ).toEqual([violationLabel(markerViolation)])
      expect(await clientCode(server)).not.toContain('MARK_B_CODE')
    },
    timeout,
  )

  test(
    'an edit that removes the marker, the importer unchanged, gives the importer the module',
    async () => {
      const recorder = violationRecorder()
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: recorder.importProtection,
        files: markedApp(marker),
      })
      expect(
        relevantViolations({ root: server.root, ...recorder }, [
          markerViolation,
        ]),
      ).toEqual([violationLabel(markerViolation)])
      expect(await clientCode(server)).not.toContain('MARK_B_CODE')
      const since = recorder.violations.length
      await server.edit({ 'src/b.ts': markedApp('')['src/b.ts'] })
      expect(server.errors).toEqual([])
      expect(recorder.violations.slice(since)).toEqual([])
      expect(await clientCode(server)).toContain('MARK_B_CODE')
    },
    timeout,
  )
})

// Rsbuild's `source.transformImport` rewrites a library's named imports
// into imports of its submodules (`import { button } from 'ui-lib'` ->
// `import { button } from 'ui-lib/button'`) before import protection sees
// the module. A specifier rule matches the specifier the user wrote; the
// file and marker rules apply to the module the rewritten import resolves
// to (SPEC J6.1). The report names the importer at the original import or
// at the use of its binding (J6.5).
// Source: mutation testing (Rsbuild host); review (a rule on the rewritten
// specifier `ui-lib/button` is no rule the user writes).
describe('Rsbuild build: an import source.transformImport rewrites', () => {
  /** The app's entry: it uses `button` of `ui-lib`. */
  const uiLibEntry = `import { button } from 'ui-lib'
export const read = () => button()
`
  /**
   * Builds an entry using `button` of `ui-lib` with Start's
   * `importProtection` options. `ui-lib/button.js` starts with `head` (e.g.
   * a marker import). The library is a dependency, or, with `local`, a
   * directory of the project the app aliases `ui-lib` to (a monorepo
   * package, say), whose files import protection checks by default.
   */
  const build = (
    importProtection: ImportProtectionOptions,
    { head = '', local = false } = {},
  ) => {
    const dir = local ? 'src/ui-lib' : 'node_modules/ui-lib'
    return buildStart({
      bundler: 'rsbuild',
      files: {
        'node_modules/ui-lib/package.json': JSON.stringify({
          name: 'ui-lib',
          type: 'module',
          exports: { '.': './index.js', './*': './*.js' },
        }),
        [`${dir}/index.js`]: `export { button } from './button.js'\n`,
        [`${dir}/button.js`]: `${head}export const button = () => 'MARK_SECRET'\n`,
        'src/entry.ts': uiLibEntry,
      },
      entry: 'src/entry.ts',
      start: { importProtection },
      rsbuildConfig: {
        resolve: local ? { alias: { 'ui-lib': `./${dir}` } } : {},
        source: {
          transformImport: [
            {
              libraryName: 'ui-lib',
              customName: 'ui-lib/{{ member }}',
              transformToDefaultImport: false,
            },
          ],
        },
      },
    })
  }

  /**
   * The import of `ui-lib` (any column of line 1) or the use `button()`, or
   * the entry without coordinates: a tool rewrote the import, so its
   * location may be unavailable (SPEC §5.14).
   */
  const atImportOrUse = expect.toSatisfy(
    (importer: string) =>
      ['src/entry.ts:2:27', 'src/entry.ts:1', 'src/entry.ts'].some((place) =>
        isAt(importer, place),
      ),
    'the import of ui-lib or the use button() in src/entry.ts',
  )

  let fileRuleError: Promise<StartBuildError> | undefined
  /** The build error when the file rule denies `ui-lib/button.js`, built once. */
  const fileRuleDenied = () =>
    // `excludeFiles: []`: the checks see dependencies (J6.10).
    (fileRuleError ??= rejection(
      build({ client: { files: ['**/ui-lib/button.js'], excludeFiles: [] } }),
    ))

  // (where it is reported is pinned below: the location is wrong)
  test('the file rule denies the module it resolves to: the build fails, naming the importer', async () => {
    expect(reportedViolations(await fileRuleDenied())).toEqual([
      {
        environment: 'client',
        importer: expect.stringMatching(/^src\/entry\.ts\b/),
      },
    ])
  }, 60_000)

  // Bug: the report of a denied import `source.transformImport` rewrote
  // points at neither the import nor the use of its binding
  // (`src/entry.ts:2:25`, the arrow of `read`; the use `button()` is at
  // 2:27): the location is only found in the rewritten code (through the
  // mock module's path), whose positions do not map back to the source.
  // Source: rsbuild/import-protection.ts resolveImporterLocation
  // (transformedSources lookup); mutation testing.
  // Impact: low; the code frame's caret points at the wrong column.
  test('the file rule denies the module it resolves to: the importer is reported at the import or the use', async () => {
    expect(reportedViolations(await fileRuleDenied())).toEqual([
      { environment: 'client', importer: atImportOrUse },
    ])
  }, 60_000)

  test('the module it resolves to is marked server-only: the build fails, naming the module and the importer', async () => {
    const error = await rejection(
      build(
        {},
        {
          head: `import '@tanstack/react-start/server-only'\n`,
          local: true,
        },
      ),
    )
    const [report, ...others] = violationsOf(error)
    expect(others).toEqual([])
    expect(report!.environment).toBe('client')
    expectMarkerViolation(report!, {
      marker: 'src/ui-lib/button.js:1',
      use: 'src/entry.ts:2:27',
      imports: ['src/entry.ts:1'],
    })
  }, 60_000)

  // Bug: a specifier denied as the user wrote it is not denied once
  // `source.transformImport` rewrote it: the loader matches the specifiers
  // of the code SWC already transformed (`ui-lib/button`), so `'ui-lib'`
  // never matches, and the build ships the library to the client without
  // any error or warning.
  // Source: rsbuild/import-protection-loader.ts transformImportProtection
  // (`matchesAny(source, matchers.specifiers)` on the post-SWC imports).
  // Impact: a client.specifiers rule on a library the app also lists in
  // source.transformImport is silently bypassed.
  test('denied as written, the build fails on it, reporting the importer at the import or the use', async () => {
    expect(
      reportedViolations(
        await rejection(build({ client: { specifiers: ['ui-lib'] } })),
      ),
    ).toEqual([{ environment: 'client', importer: atImportOrUse }])
  }, 60_000)
})

// `rsbuild build --watch`: each build reports the violations it bundles,
// whatever an earlier build reported.
// Source: mutation testing (Rsbuild host, the state of a previous build).
test('Rsbuild build --watch: a rebuild for an unrelated edit fails on the violation again', async () => {
  const entry = `import { secret } from './secret.server'
import { other } from './other'
export const read = () => secret() + other
`
  const error = await rejection(
    buildStart({
      bundler: 'rsbuild',
      files: {
        'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
        'src/other.ts': `export const other = 1\n`,
        'src/entry.ts': entry,
      },
      entry: 'src/entry.ts',
      watchEdits: { 'src/other.ts': `export const other = 2\n` },
    }),
  )
  // Rspack may compile the client more than once for the edit (each
  // distinct report counts once).
  expectViolationsAt(error, [
    {
      environment: 'client',
      use: locationIn('src/entry.ts', entry, 3, 'secret()'),
      also: ['src/entry.ts:1'],
    },
  ])
}, 60_000)

// With `performance.buildCache`, a new `rsbuild build` restores the modules
// it built before from Rspack's persistent cache without compiling them
// again: their imports of the per-edge modules that stand in for denied
// imports (DESIGN §3.14.3) must still resolve, and the build reports the
// same violations, in every behaviour and after an `onViolation` veto
// (the additional pass, R33).
// Source: upstream #8798 (Rsbuild persistent cache: "Can't resolve" the
// import-protection mock modules of restored importers).
describe('Rsbuild build: restored from the persistent cache', () => {
  // the importer is not the entry: its traces have a step through the entry
  const page = `import { secret } from './secret.server'
import { query } from './db'
import './effect.server'
export const read = () => [secret(), query()]
`
  const app = {
    'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
    'src/db.ts': `import '@tanstack/react-start/server-only'
export const query = () => 'MARK_DB'
`,
    'src/effect.server.ts': `;(globalThis as Record<string, unknown>).effect = 'MARK_EFFECT'\n`,
    'src/page.ts': page,
    'src/entry.ts': `export { read } from './page'\n`,
  }
  const expected: Array<ExpectedViolation> = [
    {
      environment: 'client',
      use: locationIn('src/page.ts', page, 4, 'secret()'),
      also: ['src/page.ts:1'],
    },
    {
      environment: 'client',
      use: locationIn('src/page.ts', page, 4, 'query()'),
      also: ['src/page.ts:2', 'src/db.ts:1'],
    },
    {
      environment: 'client',
      use: 'src/page.ts:3',
    },
  ]
  const cached = (importProtection: ImportProtectionOptions, builds = 1) =>
    buildStart({
      bundler: 'rsbuild',
      builds,
      rsbuildConfig: { performance: { buildCache: true } },
      files: app,
      entry: 'src/entry.ts',
      start: { importProtection },
    })
  /** Each distinct trace `onViolation` received, sorted. */
  const tracesOf = (violations: Array<ViolationInfo>) =>
    distinct(violations.map((info) => JSON.stringify(info.trace))).sort()
  /** The build's errors that are not violations (a module that does not resolve). */
  const unresolved = (diagnostics: Array<Diagnostic>) =>
    diagnostics
      .filter((d) => /Can't resolve|Module not found/i.test(d.text))
      .map((d) => d.text)

  test('error behaviour: the build fails on the same violations', async () => {
    const error = await rejection(cached({}, 2))
    expect(unresolved(error.diagnostics)).toEqual([])
    expectViolationsAt(error, expected)
  }, 120_000)

  test('mock behaviour: the build succeeds with the same warnings and mocks', async () => {
    const cold = await cached({ behavior: 'mock' })
    const coldWarnings = cold.client.warnings.map((w) => w.text).sort()
    const coldViolations = receivedViolations(cold.violations, cold.root)
    const coldTraces = tracesOf(cold.violations)
    const warm = await cold.rebuild()
    expect(unresolved(warm.diagnostics)).toEqual([])
    expectViolationsAt(warm, expected)
    expect(receivedViolations(warm.violations, warm.root)).toEqual(
      coldViolations,
    )
    // the same traces, with the same steps through the restored modules
    expect(tracesOf(warm.violations)).toEqual(coldTraces)
    expect(warm.client.warnings.map((w) => w.text).sort()).toEqual(coldWarnings)
    expect(warm.client.where(/MARK_SECRET|MARK_DB|MARK_EFFECT/)).toBe('nowhere')
  }, 120_000)

  test('onViolation -> false: the build bundles the real modules again', async () => {
    // (the harness lists no violation the app's `onViolation` allows)
    let asked: Array<ViolationInfo> = []
    const veto: ImportProtectionOptions = {
      onViolation: (info) => {
        asked.push(info as ViolationInfo)
        return false
      },
    }
    const askedOf = (root: string) =>
      relevantViolations({ root, violations: asked }, expected).sort()
    const cold = await cached(veto)
    expect(askedOf(cold.root)).toEqual(expected.map(violationLabel).sort())
    asked = []
    const warm = await cold.rebuild()
    expect(unresolved(warm.diagnostics)).toEqual([])
    // asked again, and allowed: nothing printed
    expect(askedOf(warm.root)).toEqual(expected.map(violationLabel).sort())
    expect(warm.violations).toEqual([])
    for (const mark of ['MARK_SECRET', 'MARK_DB', 'MARK_EFFECT']) {
      expect(warm.client.where(new RegExp(mark))).not.toBe('nowhere')
    }
  }, 120_000)
})

// Source: mutation testing.
test(
  'Rsbuild dev: the client mock of each denied import reports its own use in the browser console',
  async () => {
    const server = await startRsbuildDevServer({
      compileTimeout,
      importProtection: { client: { specifiers: ['db-lib'] } },
      files: {
        'node_modules/db-lib/package.json': JSON.stringify({
          name: 'db-lib',
          type: 'module',
          exports: { '.': './index.js' },
        }),
        'node_modules/db-lib/index.js': `export const query = () => 'MARK_LIB'\n`,
        'src/a.server.ts': `export const a = () => 'MARK_A'\n`,
        'src/b.server.ts': `export const b = () => 'MARK_B'\n`,
        'src/entry.ts': `import { a } from './a.server'
import { b } from './b.server'
import { query } from 'db-lib'
console.log(a(), b(), query())
`,
      },
    })
    expect(server.errors).toEqual([])
    const messages = await runRsbuildClient(server, { levels: true })
    expect(messages.filter((message) => message.includes('MARK_'))).toEqual([])
    const logged = consoleDiagnostics(messages)
    for (const denied of [
      { specifier: './a.server', file: 'src/a.server.ts' },
      { specifier: './b.server', file: 'src/b.server.ts' },
      { specifier: 'db-lib' },
    ]) {
      expectMockAccess(logged, {
        severity: 'error',
        ...denied,
      })
    }
  },
  timeout,
)

/**
 * What a client run logged (`runRsbuildClient` with `levels`), as
 * diagnostics of the shared oracle, by console method.
 */
function consoleDiagnostics(messages: Array<string>): Array<Diagnostic> {
  return messages.flatMap((message) => {
    const [, level, text] = /^(\w+): ([\s\S]*)$/.exec(message)!
    return diagnosticsOf(
      text!,
      level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
    )
  })
}

// Source: mutation testing (Rsbuild host, `mockAccess`).
describe('Rsbuild dev: mockAccess', () => {
  test.each<{
    mockAccess: NonNullable<ImportProtectionOptions>['mockAccess']
    reports: Array<'error' | 'warning'>
  }>([
    { mockAccess: undefined, reports: ['error'] },
    { mockAccess: 'error', reports: ['error'] },
    { mockAccess: 'warn', reports: ['warning'] },
    { mockAccess: 'off', reports: [] },
  ])(
    '$mockAccess: the use of a mocked import is reported as $reports',
    async ({ mockAccess, reports }) => {
      const server = await startRsbuildDevServer({
        compileTimeout,
        importProtection: {
          mockAccess,
          client: { specifiers: ['db-lib'] },
        },
        files: {
          'node_modules/db-lib/package.json': JSON.stringify({
            name: 'db-lib',
            type: 'module',
            exports: { '.': './index.js' },
          }),
          'node_modules/db-lib/index.js': `export const query = () => 'MARK_LIB'\n`,
          'src/a.server.ts': `export const a = () => 'MARK_A'\n`,
          'src/entry.ts': `import { a } from './a.server'
import { query } from 'db-lib'
console.log(a(), query())
`,
        },
      })
      expect(server.errors).toEqual([])
      const messages = await runRsbuildClient(server, { levels: true })
      expect(messages.filter((message) => message.includes('MARK_'))).toEqual(
        [],
      )
      // The severities logged, and each denied import (the file and the
      // specifier) named by a diagnostic of that severity.
      const logged = consoleDiagnostics(messages).filter(
        ({ severity }) => severity !== 'info',
      )
      expect(
        distinct(logged.map(({ severity }) => severity)),
        messages.join('\n'),
      ).toEqual(reports)
      for (const severity of reports) {
        for (const denied of [
          { specifier: './a.server', file: 'src/a.server.ts' },
          { specifier: 'db-lib' },
        ]) {
          expectMockAccess(logged, {
            severity,
            ...denied,
          })
        }
      }
    },
    timeout,
  )
})
