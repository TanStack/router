/**
 * What an importer exempted from import protection gets for a denied file:
 * the real module (user ruling 2026-10-17). Exempt means matched by
 * `ignoreImporters` or `exclude`, or outside `include`. Exempting a file
 * does more than silence the report; importers that are not exempt still get
 * the mock and a report. Client environment, mock mode. That nothing is
 * reported for an exempt importer is also checked in build-options.test.ts.
 * Same ruling for a denied file `client.excludeFiles` / `server.excludeFiles`
 * match (end of the file): its importers get the real module.
 */
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  inEnvironment,
  reportedImporters,
} from '../../importProtection/start-apps'
import { runViteClient, startBrowserProtectedDevServer } from './client-pages'
import type { Recorded } from '../../importProtection/start-apps'
import type { StartBuild, StartBundler } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

/**
 * What a use gives, described: the real value's text, `a safe mock`
 * (`mock-helpers.ts`), or what calling it threw.
 */
const mockText = 'a safe mock'
/** `read` for the scripts of a build (`describeValuePrelude`). */
const readPrelude = `${describeValuePrelude}
const read = (use) => {
  try {
    return describeValue(use(), 'MARK_')
  } catch (error) {
    return 'throws: ' + String(error)
  }
}
`

afterEach(() => {
  vi.restoreAllMocks()
  for (const loaded of [
    'secretLoaded',
    'vendorLoaded',
    'widgetLoaded',
    'packageLoaded',
  ]) {
    delete (globalThis as Record<string, unknown>)[loaded]
  }
})

/**
 * `src/exempt/a.ts` and `src/app/b.ts` both use the denied file
 * `src/secret.server.ts`, which records that it ran; the entry re-exports
 * both uses.
 */
const files = {
  'src/secret.server.ts': `;(globalThis as any).secretLoaded = 'MARK_SECRET_LOADED'
export const secret = () => 'MARK_SECRET'
`,
  'src/exempt/a.ts': `import { secret } from '../secret.server'
export const exemptRead = () => secret()
`,
  'src/app/b.ts': `import { secret } from '../secret.server'
export const otherRead = () => secret()
`,
  'src/entry.ts': `export { exemptRead } from './exempt/a'
export { otherRead } from './app/b'
`,
}

/**
 * Each way to exempt `src/exempt/a.ts` but not `src/app/b.ts`, and which of
 * the tests below main fails (`.fails`): `exempt` in builds and dev,
 * `control` in builds and dev.
 */
const exemptions: Array<{
  option: string
  importProtection: ImportProtectionOptions
  fails: {
    build: { exempt: boolean; control: boolean }
    dev: { exempt: boolean; control: boolean }
  }
}> = [
  {
    option: 'ignoreImporters',
    importProtection: { ignoreImporters: ['**/exempt/*.ts'] },
    fails: {
      build: { exempt: true, control: false },
      dev: { exempt: true, control: false },
    },
  },
  {
    option: 'exclude',
    importProtection: { exclude: ['src/exempt/**'] },
    fails: {
      build: { exempt: true, control: false },
      dev: { exempt: true, control: false },
    },
  },
  {
    // The denied file is outside `include` too: see the NEW bug below.
    option: 'an importer outside include',
    importProtection: { include: ['src/app/**'] },
    fails: {
      build: { exempt: false, control: true },
      dev: { exempt: true, control: true },
    },
  },
]

/**
 * The files of the reported violations (`onViolation`), `<environment>
 * <file>`, each once, sorted.
 */
const reportedFiles = (recorded: Recorded) =>
  [...new Set(reportedImporters(recorded))].sort()

/** What each re-exported use returns, and whether the denied file ran. */
const readScript = `${readPrelude}
return {
  exempt: read(entry.exemptRead),
  other: read(entry.otherRead),
  loaded: globalThis.secretLoaded ?? null,
}`

type Outcome = {
  exempt: string
  other: string
  loaded: unknown
  reported: Array<string>
}

// Bug: an exempt importer is only left out of the reports: it still gets
// the mock, because the denied file is mocked by its own transform, for
// every importer (vite/import-protection-plugin/plugin.ts:2158 self-denial;
// the Rsbuild adapter behaves the same). User ruling 2026-10-17.
// Impact: code a project exempts on purpose (tests, generated code)
// silently gets a mock instead of the module it imports.
const expectExemptGetsRealModule = (outcome: Outcome) =>
  expect({
    exempt: outcome.exempt,
    loaded: outcome.loaded,
    reported: outcome.reported,
  }).toEqual({
    exempt: 'MARK_SECRET',
    loaded: 'MARK_SECRET_LOADED',
    reported: ['client src/app/b.ts'],
  })

// Control: the importer that is not exempt gets the mock and is reported.
// NEW bug (`include` rows): with `importProtection.include`, a denied file
// outside the patterns is never mocked, because its own transform skips
// files out of scope before the self-denial
// (vite/import-protection-plugin/plugin.ts:2139 `shouldCheckImporter(file)`;
// Rsbuild: same outcome). An included importer is reported, but a mock-mode
// build ships the real server-only module to the client, and in Vite dev the
// importer's rewrite (`import __tss_deny_0 from '/src/secret.server.ts'`)
// reads a default export the real file lacks, so the page fails to load.
// Impact: server-only code in the client bundle in mock mode (the dev
// default, and `behavior: { build: 'mock' }`), or a broken dev page.
const expectOtherGetsMock = (outcome: Outcome) =>
  expect({ other: outcome.other, reported: outcome.reported }).toEqual({
    other: mockText,
    reported: expect.arrayContaining(['client src/app/b.ts']),
  })

describe.each(startBundlers)('%s build', (bundler) => {
  describe.each(exemptions)('$option', ({ importProtection, fails }) => {
    // One build for both tests.
    let built: Promise<StartBuild> | undefined
    let dispose: (() => Promise<void>) | undefined
    const app = () =>
      (built ??= buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { ...importProtection, behavior: 'mock' } },
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      }))
    afterAll(() => dispose?.())

    async function outcome(): Promise<Outcome> {
      const build = await app()
      const { result } = await build.client.run(readScript)
      return {
        ...(result as Omit<Outcome, 'reported'>),
        // What the build reported for the client
        reported: reportedFiles(inEnvironment(build, 'client')),
      }
    }

    ;(fails.build.control ? test.fails : test)(
      'an importer that is not exempt gets the mock and is reported',
      async () => {
        expectOtherGetsMock(await outcome())
      },
      timeout,
    )
    ;(fails.build.exempt ? test.fails : test)(
      'the exempt importer gets the real module, and is not reported',
      async () => {
        expectExemptGetsRealModule(await outcome())
      },
      timeout,
    )
  })
})

describe.each(exemptions)(
  'vite dev: $option',
  ({ importProtection, fails }) => {
    /** Loads the entry as a browser would; what it reads, and the logs. */
    async function outcome(): Promise<Outcome> {
      const server = await startBrowserProtectedDevServer(
        files,
        importProtection,
      )
      const { result } = await runViteClient(
        server,
        '/src/entry.ts',
        readScript,
      )
      return {
        ...(result as Omit<Outcome, 'reported'>),
        reported: reportedFiles(server),
      }
    }

    ;(fails.dev.control ? test.fails : test)(
      'an importer that is not exempt gets the mock and is reported',
      async () => {
        expectOtherGetsMock(await outcome())
      },
      timeout,
    )
    ;(fails.dev.exempt ? test.fails : test)(
      'the exempt importer gets the real module, and is not reported',
      async () => {
        expectExemptGetsRealModule(await outcome())
      },
      timeout,
    )
  },
)

/**
 * `client.excludeFiles` / `server.excludeFiles` (user ruling 2026-10-17): a
 * denied file the patterns match is not checked, so its importers get the
 * real module and nothing is reported. Each use records whether its denied
 * file ran:
 * - `vendor`: `src/vendor/secret.server.ts`, denied to the client;
 * - `widget`: `src/vendor/widget.client.ts`, denied to the server (SSR);
 * - `package`: the `*.server.*` entry of the dependency `server-pkg`, which
 *   the default patterns (`**\/node_modules/**`) match.
 */
const excludedFiles = {
  'src/vendor/secret.server.ts': `;(globalThis as any).vendorLoaded = 'MARK_VENDOR_LOADED'
export const secret = () => 'MARK_VENDOR'
`,
  'src/vendor/widget.client.ts': `;(globalThis as any).widgetLoaded = 'MARK_WIDGET_LOADED'
export const widget = () => 'MARK_WIDGET'
`,
  'node_modules/server-pkg/package.json': JSON.stringify({
    name: 'server-pkg',
    type: 'module',
    exports: { '.': './secret.server.js' },
  }),
  'node_modules/server-pkg/secret.server.js': `globalThis.packageLoaded = 'MARK_PACKAGE_LOADED'
export const secret = () => 'MARK_PACKAGE'
`,
  'src/app/vendor-user.ts': `import { secret } from '../vendor/secret.server'
export const vendorRead = () => secret()
`,
  'src/app/widget-user.ts': `import { widget } from '../vendor/widget.client'
export const widgetRead = () => widget()
`,
  'src/app/package-user.ts': `import { secret } from 'server-pkg'
export const packageRead = () => secret()
`,
  'src/entry.ts': `export { vendorRead } from './app/vendor-user'
export { widgetRead } from './app/widget-user'
export { packageRead } from './app/package-user'
`,
}

type Use = { read: string; loaded: unknown }

/** Each use of `excludedFiles`: what it returns, and whether its file ran. */
type ExcludedOutcome = Record<'vendor' | 'widget' | 'package', Use> & {
  reported: Array<string>
}

const excludedReadScript = `${readPrelude}
const use = (fn, loaded) => ({ read: read(fn), loaded: globalThis[loaded] ?? null })
return {
  vendor: use(entry.vendorRead, 'vendorLoaded'),
  widget: use(entry.widgetRead, 'widgetLoaded'),
  package: use(entry.packageRead, 'packageLoaded'),
}`

/** The real module of a use: its value, and its file ran. */
const realModule = (name: string): Use => ({
  read: `MARK_${name.toUpperCase()}`,
  loaded: `MARK_${name.toUpperCase()}_LOADED`,
})

/** A mock: it converts to the mock's text, and the denied file never ran. */
const mockedModule = { read: mockText, loaded: null }

/** Custom patterns that match `src/vendor`; `node_modules` stays excluded. */
const vendorExcluded = ['**/vendor/**', '**/node_modules/**']

const vendorExcludedOptions: ImportProtectionOptions = {
  client: { excludeFiles: vendorExcluded },
  server: { excludeFiles: vendorExcluded },
}

/**
 * One mock-mode build of `excludedFiles` with `importProtection`, shared by
 * the tests of the enclosing `describe`; what an environment's uses read,
 * and the files it reports.
 */
function excludedBuild(
  bundler: StartBundler,
  importProtection: ImportProtectionOptions,
) {
  let built: Promise<StartBuild> | undefined
  let dispose: (() => Promise<void>) | undefined
  afterAll(() => dispose?.())
  return async (environment: 'client' | 'ssr'): Promise<ExcludedOutcome> => {
    built ??= buildStart({
      bundler,
      files: excludedFiles,
      entry: 'src/entry.ts',
      start: { importProtection: { ...importProtection, behavior: 'mock' } },
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
    const build = await built
    const { result: read } = await build[environment].run(excludedReadScript)
    return {
      ...(read as Omit<ExcludedOutcome, 'reported'>),
      // What the build reported for the environment
      reported: reportedFiles(
        inEnvironment(build, environment === 'ssr' ? 'server' : 'client'),
      ),
    }
  }
}

describe.each(startBundlers)('%s build: excludeFiles', (bundler) => {
  describe('custom patterns', () => {
    const outcome = excludedBuild(bundler, vendorExcludedOptions)

    test(
      'client: the importer of a denied file client.excludeFiles matches gets the real module, and nothing is reported',
      async () => {
        const { vendor, reported } = await outcome('client')
        expect({ vendor, reported }).toEqual({
          vendor: realModule('vendor'),
          reported: [],
        })
      },
      timeout,
    )
    test(
      'ssr: the importer of a denied file server.excludeFiles matches gets the real module, and nothing is reported',
      async () => {
        const { widget, reported } = await outcome('ssr')
        expect({ widget, reported }).toEqual({
          widget: realModule('widget'),
          reported: [],
        })
      },
      timeout,
    )
  })

  describe('default patterns', () => {
    const outcome = excludedBuild(bundler, {})

    // Controls: the same files, which the default patterns do not match.
    test(
      'client: the importer of the same denied file outside the patterns gets the mock and is reported',
      async () => {
        const { vendor, reported } = await outcome('client')
        expect({ vendor, reported }).toEqual({
          vendor: mockedModule,
          reported: expect.arrayContaining(['client src/app/vendor-user.ts']),
        })
      },
      timeout,
    )
    test(
      'ssr: the importer of the same denied file outside the patterns gets the mock and is reported',
      async () => {
        const { widget, reported } = await outcome('ssr')
        expect({ widget, reported }).toEqual({
          widget: mockedModule,
          reported: expect.arrayContaining(['server src/app/widget-user.ts']),
        })
      },
      timeout,
    )
    test(
      'client: the importer of a denied file of a dependency gets the real module, and is not reported',
      async () => {
        const { package: used, reported } = await outcome('client')
        expect({ package: used, reported }).toEqual({
          package: realModule('package'),
          reported: expect.not.arrayContaining([
            'client src/app/package-user.ts',
          ]),
        })
      },
      timeout,
    )
  })
})

describe('vite dev: excludeFiles', () => {
  /** Loads the entry as a browser would; what its uses read, and the logs. */
  async function outcome(
    importProtection: ImportProtectionOptions,
  ): Promise<Omit<ExcludedOutcome, 'widget'>> {
    const server = await startBrowserProtectedDevServer(
      excludedFiles,
      importProtection,
    )
    const { result } = await runViteClient(
      server,
      '/src/entry.ts',
      `${readPrelude}
const use = (fn, loaded) => ({ read: read(fn), loaded: globalThis[loaded] ?? null })
return { vendor: use(entry.vendorRead, 'vendorLoaded'), package: use(entry.packageRead, 'packageLoaded') }`,
    )
    return {
      ...(result as Omit<ExcludedOutcome, 'widget' | 'reported'>),
      reported: reportedFiles(server),
    }
  }

  test(
    'custom patterns: the importer of a denied file client.excludeFiles matches gets the real module, and nothing is reported',
    async () => {
      const { vendor, reported } = await outcome(vendorExcludedOptions)
      expect({ vendor, reported }).toEqual({
        vendor: realModule('vendor'),
        reported: [],
      })
    },
    timeout,
  )
  test(
    'default patterns: the importer of the same denied file outside the patterns gets the mock and is reported',
    async () => {
      const { vendor, reported } = await outcome({})
      expect({ vendor, reported }).toEqual({
        vendor: mockedModule,
        reported: expect.arrayContaining(['client src/app/vendor-user.ts']),
      })
    },
    timeout,
  )
  test(
    'default patterns: the importer of a denied file of a dependency gets the real module, and is not reported',
    async () => {
      const { package: used, reported } = await outcome({})
      expect({ package: used, reported }).toEqual({
        package: realModule('package'),
        reported: expect.not.arrayContaining([
          'client src/app/package-user.ts',
        ]),
      })
    },
    timeout,
  )
})
