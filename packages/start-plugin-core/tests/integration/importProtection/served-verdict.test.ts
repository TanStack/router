/**
 * A denied file compiled under its own id is one module: real or mocked for
 * every importer at once. R142: the choice depends on its static importers
 * only (real when an exempt importer imports it, else mocked), whatever
 * order the bundler compiles them in and whether a module was compiled now
 * or restored from a persistent cache; an exempt pattern importer
 * (`import.meta.glob`, `import.meta.webpackContext`) gets whatever the file
 * is served. R147: when one importer needs the file as it is (an exempt
 * plain importer, an import `allowImport` allows) and a checked one reaches
 * the file itself (a pattern import, an import another plugin added), the
 * build fails on every host under both behaviors, naming the file, each
 * importer and why; the dev server reports the same error and keeps
 * serving. A Vite build that served the mock before it met the exempt
 * importer of an exempt pattern importer follows `behavior` (R142 (2)): its
 * `error` build fails, naming the file. Design 4 (import protection's
 * real-or-mock choice) §5: F5-1, F5-1b, F5-2, F5-6.
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  captureConsole,
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../../build-harness'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import {
  allowedPlain,
  app,
  denied,
  holdUntilCompiled,
  named,
  options,
  outcomeOf,
  readScript,
  realForBoth,
  timeout,
  uses,
} from './served-verdict-app'
import { importersIn, settledAcrossTurn } from './v2-hosts'
import type { StartBuild } from '../../build-harness'
import type { Plugin } from 'vite'

afterEach(() => {
  delete (globalThis as Record<string, unknown>).uses
})

/** The webpackContext/glob call a pattern importer's position is at. */
const patternCall = (bundler: 'vite' | 'rsbuild') =>
  bundler === 'vite' ? 'import.meta.glob' : 'import.meta.webpackContext'

/**
 * R147: a failed build whose errors name the denied file, each importer
 * that needs it as it is, and the checked importer at its pattern import.
 */
async function expectConflict(
  build: () => Promise<StartBuild>,
  needer: string,
  checked: { file: string; source: string; at: string | null },
) {
  const error = await build().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(StartBuildError)
  const { diagnostics } = error as StartBuildError
  expectDiagnostic(diagnostics, { severity: 'error', file: denied })
  expectDiagnostic(diagnostics, { severity: 'error', file: needer })
  expectDiagnostic(diagnostics, {
    severity: 'error',
    file: checked.file,
    ...(checked.at !== null && {
      position: diagnosticPosition(checked.source, checked.at),
    }),
  })
}

describe.each(['vite', 'rsbuild'] as const)('%s build, R147', (bundler) => {
  // F5-1: one module cannot be both: the build fails whichever order the
  // bundler compiles them in, and under both behaviors
  test.each(['mock', 'error'] as const)(
    'an exempt plain importer and a checked pattern importer: the build fails, naming both (%s)',
    async (behavior) => {
      const files = app({ bundler, glob: 'src', first: 'plain' })
      await expectConflict(
        () =>
          buildStart({
            bundler,
            files,
            entry: 'src/entry.ts',
            start: { importProtection: options(behavior) },
          }),
        'src/generated/reg.ts',
        {
          file: 'src/glob.ts',
          source: files['src/glob.ts']!,
          at: patternCall(bundler),
        },
      )
    },
    timeout,
  )

  test(
    'a plain import allowImport allows and a checked pattern importer: the build fails, naming both',
    async () => {
      const files = app({ bundler, glob: 'src', first: 'pattern' })
      await expectConflict(
        () =>
          buildStart({
            bundler,
            files,
            entry: 'src/entry.ts',
            start: { importProtection: allowedPlain('error') },
          }),
        'src/generated/reg.ts',
        {
          file: 'src/glob.ts',
          source: files['src/glob.ts']!,
          at: patternCall(bundler),
        },
      )
    },
    timeout,
  )

  // the error's first fix applied: the file left out of the pattern
  test(
    'the denied file left out of the pattern: the build passes, the exempt importer gets the real module',
    async () => {
      const files = app({ bundler, glob: 'src', first: 'plain' })
      files['src/glob.ts'] =
        bundler === 'vite'
          ? files['src/glob.ts']!.replace(
              `import.meta.glob('./lib/*.server.ts'`,
              `import.meta.glob(['./lib/*.server.ts', '!./lib/db.server.ts']`,
            )
          : files['src/glob.ts']!.replace(
              String.raw`regExp: /\.server\.ts$/`,
              String.raw`regExp: /(?<!\/db)\.server\.ts$/`,
            )
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler,
            files,
            entry: 'src/entry.ts',
            start: { importProtection: options('error') },
          }),
        ),
      ).toEqual({
        ...realForBoth,
        uses: { plain: 'MARK_SECRET', glob: [] },
      })
    },
    timeout,
  )
})

// R147 with an import another plugin added (no pattern import anywhere)
test(
  'vite build, R147: an exempt plain importer and a checked module a plugin adds an import to: the build fails, naming both',
  async () => {
    const files = {
      ...app({ bundler: 'vite', glob: 'src', first: 'plain' }),
      'src/glob.ts': `export const viaGlob = async () => [(globalThis as any).added]\n`,
    }
    const addImport: Plugin = {
      name: 'test:add-import',
      enforce: 'post',
      applyToEnvironment: (environment) => environment.name === 'client',
      transform(code, id) {
        if (id.endsWith('/src/glob.ts')) {
          return {
            code: `import { secret } from './lib/db.server'\n;(globalThis as any).added = secret\n${code}`,
            map: null,
          }
        }
        return null
      },
    }
    await expectConflict(
      () =>
        buildStart({
          bundler: 'vite',
          files,
          entry: 'src/entry.ts',
          viteConfig: { plugins: [addImport] },
          start: { importProtection: options('error') },
        }),
      'src/generated/reg.ts',
      { file: 'src/glob.ts', source: files['src/glob.ts'], at: null },
    )
  },
  timeout,
)

describe('rsbuild build', () => {
  // F5-2: Rspack compiles the denied file for the pattern importer before
  // the exempt plain importer three modules deep. Control: plain first.
  test(
    'two exempt importers, the plain one first: both get the real module, nothing reported',
    async () => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler: 'rsbuild',
            files: app({
              bundler: 'rsbuild',
              glob: 'generated',
              first: 'plain',
            }),
            entry: 'src/entry.ts',
            start: { importProtection: options('error') },
          }),
        ),
      ).toEqual(realForBoth)
    },
    timeout,
  )

  test(
    'two exempt importers, the pattern one first: both get the real module, nothing reported',
    async () => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler: 'rsbuild',
            files: app({
              bundler: 'rsbuild',
              glob: 'generated',
              first: 'pattern',
            }),
            entry: 'src/entry.ts',
            start: { importProtection: options('error') },
          }),
        ),
      ).toEqual(realForBoth)
    },
    timeout,
  )

  // F5-1b: the persistent cache restores the file real after the exempt
  // importer's import was removed: the warm build serves it the mock, as a
  // cold build of the same files does, and warns about it (R89: its only
  // importer, the pattern importer, is exempt)
  test(
    'a persistent cache: the exempt import removed between builds, the exempt pattern importer gets the mock, with a warning',
    async () => {
      const cold = await buildStart({
        bundler: 'rsbuild',
        rsbuildConfig: { performance: { buildCache: true } },
        files: app({ bundler: 'rsbuild', glob: 'generated', first: 'plain' }),
        entry: 'src/entry.ts',
        start: { importProtection: options('mock') },
      })
      expect((await uses(cold)).glob).toEqual(['MARK_SECRET'])
      const warm = await cold.rebuild({
        'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
      })
      expect({
        glob: (await uses(warm)).glob,
        problems: problems(warm.diagnostics).map(named),
        where: warm.client.where('MARK_SECRET'),
      }).toEqual({
        glob: ['mock'],
        problems: [`warning ${denied}`],
        where: 'nowhere',
      })
    },
    timeout,
  )
})

describe('vite build', () => {
  // F5-2 on Vite, R142 (2): the exempt plain importer is loaded after the
  // denied file was compiled (served the mock) for the exempt pattern
  // importer. A Vite build cannot build the file again: `error` fails,
  // naming the file; `mock` warns, naming it
  test(
    'two exempt importers, the plain one compiled after the denied file: the error build fails, naming the file',
    async () => {
      const outcome = await outcomeOf(() =>
        buildStart({
          bundler: 'vite',
          files: app({ bundler: 'vite', glob: 'generated', first: 'pattern' }),
          entry: 'src/entry.ts',
          viteConfig: {
            plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
          },
          start: { importProtection: options('error') },
        }),
      )
      expect(outcome).toMatchObject({
        failed: true,
        errors: [expect.stringContaining(denied)],
      })
    },
    timeout,
  )

  test(
    'two exempt importers, the plain one compiled after the denied file: the mock build warns, naming the file',
    async () => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler: 'vite',
            files: app({
              bundler: 'vite',
              glob: 'generated',
              first: 'pattern',
            }),
            entry: 'src/entry.ts',
            viteConfig: {
              plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
            },
            start: { importProtection: options('mock') },
          }),
        ),
      ).toEqual({
        failed: false,
        uses: { plain: 'mock', glob: ['mock'] },
        reported: [],
        problems: [`warning ${denied}`],
      })
    },
    timeout,
  )

  // the same order with the plain import allowed by `allowImport`
  test(
    'an exempt pattern importer, then a plain import allowImport allows: the error build fails, naming the file',
    async () => {
      const outcome = await outcomeOf(() =>
        buildStart({
          bundler: 'vite',
          files: app({ bundler: 'vite', glob: 'generated', first: 'pattern' }),
          entry: 'src/entry.ts',
          viteConfig: {
            plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
          },
          start: { importProtection: allowedPlain('error') },
        }),
      )
      expect(outcome).toMatchObject({
        failed: true,
        errors: [expect.stringContaining(denied)],
      })
    },
    timeout,
  )

  // I3's other direction (design 4 §6 risk 3): a watch rebuild compiles
  // every module again, here the denied file before its exempt importer,
  // whose edit removed the plain import: the file is served as it is to the
  // checked pattern importer, and the rebuild says so (the first build
  // fails: its importers disagree, R147)
  test(
    'vite build --watch: the exempt import removed, the denied file compiled before its importer: served as it is and reported',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: app({ bundler: 'vite', glob: 'src', first: 'pattern' }),
        entry: 'src/entry.ts',
        viteConfig: {
          plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
        },
        start: { importProtection: options('mock') },
        watchEdits: {
          'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
        },
      })
      expect({
        first: problems(build.firstBuild).map(named),
        uses: await uses(build),
        problems: problems(build.diagnostics).map(named),
      }).toEqual({
        first: [`error ${denied}`],
        uses: { plain: 'none', glob: ['MARK_SECRET'] },
        problems: [`warning ${denied}`],
      })
    },
    timeout,
  )

  // the report's fix: any save rebuilds, and compiles the file as its mock
  test(
    'vite build --watch: the denied file served as it is, a later save: the checked pattern importer gets the mock',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: app({ bundler: 'vite', glob: 'src', first: 'pattern' }),
        entry: 'src/entry.ts',
        viteConfig: {
          plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
        },
        start: { importProtection: options('mock') },
        watchEdits: [
          {
            edits: {
              'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
            },
          },
          { edits: { 'src/a.ts': `export { viaPlain } from './b'\n\n` } },
        ],
      })
      expect({
        uses: await uses(build),
        reported: importersIn(build, 'client'),
        where: build.client.where('MARK_SECRET'),
      }).toEqual({
        uses: { plain: 'none', glob: ['mock'] },
        reported: ['src/glob.ts'],
        where: 'nowhere',
      })
    },
    timeout,
  )
})

// F5-2 in Vite dev: the denied file is compiled (served the mock) for the
// exempt pattern importer before the exempt plain importer three modules
// deep; the dev server builds it again once it read the plain import (the
// page reloads), so both get the real module
test(
  'vite dev: two exempt importers, the plain one compiled after the denied file: both get the real module',
  async () => {
    const server = await startDevServer({
      browser: true,
      start: { importProtection: options('mock') },
      files: app({ bundler: 'vite', glob: 'generated', first: 'pattern' }),
      plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
    })
    // (the first load compiles them in that order)
    await runViteClient(server, '/src/router.ts', readScript)
    await server.idle()
    const after = await runViteClient(server, '/src/router.ts', readScript)
    expect(after.result).toEqual({
      plain: 'MARK_SECRET',
      glob: ['MARK_SECRET'],
    })
  },
  timeout,
)

// The same order with a checked plain importer whose import `allowImport`
// allows: the importers disagree (R147), the dev server says so as an
// error and keeps serving the file as the ledger says
test(
  'vite dev: a checked pattern importer, then a plain import allowImport allows: an error naming both, both get the real module',
  async () => {
    const server = await startDevServer({
      browser: true,
      start: { importProtection: allowedPlain('mock') },
      files: app({ bundler: 'vite', glob: 'src', first: 'pattern' }),
      plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
    })
    // (the first load compiles them in that order)
    await runViteClient(server, '/src/router.ts', readScript)
    await server.idle()
    const after = await runViteClient(server, '/src/router.ts', readScript)
    expect(after.result).toEqual({
      plain: 'MARK_SECRET',
      glob: ['MARK_SECRET'],
    })
    expectDiagnostic(server.diagnostics, {
      severity: 'error',
      file: 'src/generated/reg.ts',
    })
    expectDiagnostic(server.diagnostics, {
      severity: 'error',
      file: 'src/glob.ts',
    })
  },
  timeout,
)

// F5-6, exempt half: an edit removes the exempt plain import; the denied
// file, reached now only by the checked pattern importer, is served the
// mock without a restart (a fresh start serves it the mock)
describe('dev: the exempt import removed by an edit', () => {
  const removed = {
    'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
  }

  test(
    'vite dev: the checked pattern importer gets the mock',
    async () => {
      const recorder = violationRecorder(options('mock'))
      const server = await startDevServer({
        browser: true,
        start: { importProtection: recorder.importProtection },
        files: app({
          bundler: 'vite',
          glob: 'src',
          first: 'plain',
          lazy: true,
        }),
      })
      const before = await runViteClient(server, '/src/router.ts', readScript)
      expect(before.result).toEqual({
        plain: 'MARK_SECRET',
        glob: ['MARK_SECRET'],
      })
      await server.edit(removed)
      await server.idle()
      const after = await runViteClient(server, '/src/router.ts', readScript)
      expect(after.result).toEqual({ plain: 'none', glob: ['mock'] })
    },
    timeout,
  )

  test(
    'rsbuild dev: the checked pattern importer gets the mock',
    async () => {
      const recorder = violationRecorder(options('mock'))
      const server = await startRsbuildStartDevServer({
        compileTimeout: timeout,
        browser: true,
        hmr: false,
        files: app({
          bundler: 'rsbuild',
          glob: 'src',
          first: 'plain',
          lazy: true,
        }),
        start: { importProtection: recorder.importProtection },
      })
      const run = async () =>
        (
          (await captureConsole(() => runInClient(server, readScript)))
            .result as {
            result: unknown
          }
        ).result
      expect(await run()).toEqual({
        plain: 'MARK_SECRET',
        glob: ['MARK_SECRET'],
      })
      await settledAcrossTurn(server)
      await server.edit(removed)
      await settledAcrossTurn(server)
      expect(await run()).toEqual({ plain: 'none', glob: ['mock'] })
    },
    timeout,
  )
})
