/**
 * What makes a denied file compiled under its own id real (its demand), and
 * when it is read. Real demand counts only the importers the compilation
 * holds and the imports that are there now: an exempt importer the app no
 * longer imports, a split-out part of an exempt route that no longer exists,
 * or a removed import `allowImport` allowed asks for nothing, and the next
 * compilation serves the file as its remaining importers ask (watch builds,
 * Rsbuild dev). A build registers `allowImport`'s answer at the importer's
 * compile, as dev does, and a dev compile reads the demand again after
 * waiting for `allowImport`. Design 4 final review (REVIEW-design4-final.md)
 * findings 2-5.
 *
 * Vite dev keeps the file real for an orphaned exempt importer or a removed
 * allowed import until a restart: a documented limit (the guide's
 * Limitations), not tested here.
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  captureConsole,
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../../build-harness'
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
  deniedModule,
  holdUntilCompiled,
  named,
  options,
  outcomeOf,
  patternImporter,
  plainImporter,
  readScript,
  realForBoth,
  timeout,
  uses,
} from './served-verdict-app'
import { settledAcrossTurn } from './v2-hosts'
import type { Plugin } from 'vite'

afterEach(() => {
  delete (globalThis as Record<string, unknown>).uses
})

/**
 * `src/mid.ts` (checked) re-exports `src/generated/reg.ts` (exempt), which
 * imports the denied file plainly; `src/generated/glob.ts` (exempt too:
 * a checked one would fail the build, R147) reaches it with a pattern
 * import. `orphaned` makes `mid` stop importing `reg`, which stays
 * on disk unchanged; `touched` is an unrelated save.
 */
function orphanApp(bundler: 'vite' | 'rsbuild', lazy = false) {
  return {
    [denied]: deniedModule,
    'src/generated/reg.ts': plainImporter('generated'),
    'src/mid.ts': `export { viaPlain } from './generated/reg'\n`,
    'src/other.ts': `export const other = 1\n`,
    'src/generated/glob.ts': patternImporter(bundler, '../', lazy),
    'src/entry.ts': `import { viaPlain } from './mid'
import { viaGlob } from './generated/glob'
import { other } from './other'
export { viaPlain, viaGlob, other }
;(globalThis as any).uses = { plain: viaPlain, glob: viaGlob }
`,
    'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
  }
}
const orphaned = { 'src/mid.ts': `export const viaPlain = () => 'none'\n` }
const touched = { 'src/other.ts': `export const other = 2\n` }

/** After the edit: the pattern importer gets the mock, with R89's warning naming the file, and nothing of it ships. */
const mockedForPattern = {
  uses: { plain: 'none', glob: ['mock'] },
  problems: [`warning ${denied}`],
  where: 'nowhere',
}

/** A watch build's outcome after its edits (`mockedForPattern`'s shape). */
async function watched(
  bundler: 'vite' | 'rsbuild',
  files: Record<string, string>,
  importProtection: ReturnType<typeof options>,
  watchEdits: Parameters<typeof buildStart>[0]['watchEdits'],
) {
  const build = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start: { importProtection },
    watchEdits,
  })
  return {
    uses: await uses(build),
    // (Rsbuild's rebuild may be more than one compilation, each printing it)
    problems: [...new Set(problems(build.diagnostics).map(named))],
    where: build.client.where('MARK_SECRET'),
  }
}

describe('an exempt importer the app no longer imports', () => {
  // Rspack builds the file again in the compilation of the edit
  test(
    'rsbuild build --watch: the pattern importer gets the mock, with a warning',
    async () => {
      expect(
        await watched(
          'rsbuild',
          orphanApp('rsbuild'),
          options('mock'),
          orphaned,
        ),
      ).toEqual(mockedForPattern)
    },
    timeout,
  )

  test(
    'rsbuild dev: the pattern importer gets the mock',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout: timeout,
        browser: true,
        hmr: false,
        files: orphanApp('rsbuild', true),
        start: { importProtection: options('mock') },
      })
      const run = async () =>
        (
          (await captureConsole(() => runInClient(server, readScript)))
            .result as { result: unknown }
        ).result
      expect(await run()).toEqual({
        plain: 'MARK_SECRET',
        glob: ['MARK_SECRET'],
      })
      await settledAcrossTurn(server)
      await server.edit(orphaned)
      await settledAcrossTurn(server)
      expect(await run()).toEqual({ plain: 'none', glob: ['mock'] })
    },
    timeout,
  )

  // A Vite rebuild compiles the file once, before it knows the importer is
  // gone: it ships as it is, and the rebuild says so (the report's fix:
  // save any file)
  test(
    'vite build --watch: the rebuild reports the file kept as it is',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        files: orphanApp('vite'),
        entry: 'src/entry.ts',
        start: { importProtection: options('mock') },
        watchEdits: orphaned,
      })
      // (its first build may report the file served as its mock: the two
      // importers are exempt, and Vite compiles it once, R142 (2))
      expect({
        uses: await uses(build),
        problems: problems(build.diagnostics).map(named),
      }).toEqual({
        uses: { plain: 'none', glob: ['MARK_SECRET'] },
        problems: [`warning ${denied}`],
      })
    },
    timeout,
  )

  test(
    'vite build --watch: a later save: the pattern importer gets the mock, with a warning',
    async () => {
      expect(
        await watched('vite', orphanApp('vite'), options('mock'), [
          { edits: orphaned },
          { edits: touched },
        ]),
      ).toEqual(mockedForPattern)
    },
    timeout,
  )
})

/**
 * An exempt route (`exclude`) whose component, split out of the route
 * module, imports the denied file; `src/generated/glob.ts` (exempt) reaches
 * it with a pattern import. The edit removes the component: the route file stays.
 */
function routeApp(bundler: 'vite' | 'rsbuild') {
  return {
    [denied]: deniedModule,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { secret } from '../lib/db.server'
export const Route = createFileRoute('/')({
  component: () => String(secret()),
})
`,
    'src/generated/glob.ts': patternImporter(bundler, '../', false),
    'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
    'src/entry.ts': `export { routeTree } from './routeTree.gen'
export { viaGlob } from './generated/glob'
`,
  }
}
const componentRemoved = {
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
`,
}

describe.each(['vite', 'rsbuild'] as const)(
  '%s build --watch: an exempt route split component removed',
  (bundler) => {
    test(
      'the pattern importer gets the mock, with a warning',
      async () => {
        const build = await buildStart({
          bundler,
          files: routeApp(bundler),
          entry: 'src/entry.ts',
          start: {
            importProtection: options('mock', {
              exclude: ['src/routes/**', 'src/generated/**'],
            }),
          },
          // (Vite: the rebuild of the edit reports the file kept as it is)
          watchEdits:
            bundler === 'vite'
              ? [
                  { edits: componentRemoved },
                  {
                    edits: {
                      'src/entry.ts': `${routeApp(bundler)['src/entry.ts']}\n`,
                    },
                  },
                ]
              : componentRemoved,
        })
        const { result } = await build.client.run(
          `return await entry.viaGlob()`,
        )
        expect({
          glob: result,
          // (Rsbuild's rebuild may be more than one compilation, each printing it)
          problems: [...new Set(problems(build.diagnostics).map(named))],
          where: build.client.where('MARK_SECRET'),
        }).toEqual({
          glob: ['mock'],
          problems: [`warning ${denied}`],
          where: 'nowhere',
        })
      },
      timeout,
    )
  },
)

/**
 * `src/reg.ts` (checked) imports the denied file, which `allowImport`
 * allows; `src/generated/glob.ts` (exempt) reaches it with a pattern import.
 * `removed` takes the import out of `reg`.
 */
function allowApp(bundler: 'vite' | 'rsbuild') {
  return {
    ...orphanApp(bundler),
    'src/reg.ts': plainImporter(''),
    'src/mid.ts': `export { viaPlain } from './reg'\n`,
  }
}
const allowReg = options('mock', {
  allowImport: (info) => info.importer.endsWith('src/reg.ts'),
})
const removed = { 'src/reg.ts': `export const viaPlain = () => 'none'\n` }

describe('an import allowImport allowed, removed', () => {
  test(
    'rsbuild build --watch: the pattern importer gets the mock, with a warning',
    async () => {
      expect(
        await watched('rsbuild', allowApp('rsbuild'), allowReg, removed),
      ).toEqual(mockedForPattern)
    },
    timeout,
  )

  test(
    'vite build --watch, then a later save: the pattern importer gets the mock, with a warning',
    async () => {
      expect(
        await watched('vite', allowApp('vite'), allowReg, [
          { edits: removed },
          { edits: touched },
        ]),
      ).toEqual(mockedForPattern)
    },
    timeout,
  )
})

/**
 * Holds the client environment's resolutions of `importer`'s imports, once
 * its transform ended, until Start compiled `until` (the resolutions of its
 * own compile pass): a user plugin that is slow on one file's imports.
 */
function holdImportsOf(importer: string, until: string): Plugin {
  let transformed = false
  let release!: () => void
  const compiled = new Promise<void>((resolve) => (release = resolve))
  return {
    name: 'test:hold-imports',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    async resolveId(_source, from) {
      if (transformed && from?.endsWith(importer)) {
        await compiled
      }
      return null
    },
    transform: {
      order: 'post',
      handler(_code, id) {
        if (id.endsWith(importer)) {
          transformed = true
        }
        if (id.endsWith(until)) {
          release()
        }
      },
    },
  }
}

// Fix list item 1 (both rulings): the answer for the plain import is
// registered at its importer's compile, so the denied file compiled after
// that compile and before the bundler resolves the import is served real
// (with the exempt pattern importer, the build warns about the shape in
// either order)
test(
  'vite build: the denied file compiled between the compile of a plain import allowImport allows and its resolution: both get the real module, with a warning',
  async () => {
    const outcome = await outcomeOf(() =>
      buildStart({
        bundler: 'vite',
        files: app({ bundler: 'vite', glob: 'generated', first: 'plain' }),
        entry: 'src/entry.ts',
        viteConfig: {
          plugins: [
            ...holdUntilCompiled(`/${denied}`, '/src/generated/reg.ts'),
            holdImportsOf('/src/generated/reg.ts', denied),
          ],
        },
        start: { importProtection: allowedPlain('mock') },
      }),
    )
    expect(outcome).toEqual({
      ...realForBoth,
      problems: [`warning ${denied}`],
    })
  },
  timeout,
)

// Finding 3: `allowImport` answers about the denied file itself after the
// exempt importer was compiled; the verdict reads the demand again
test(
  'vite dev: the exempt importer compiled while allowImport answers about the denied file: both get the real module',
  async () => {
    let asked!: () => void
    const askedOnce = new Promise<void>((resolve) => (asked = resolve))
    let compiled!: () => void
    const compiledOnce = new Promise<void>((resolve) => (compiled = resolve))
    const plugin: Plugin = {
      name: 'test:exempt-importer-during-allow-import',
      applyToEnvironment: (environment) => environment.name === 'client',
      async load(id) {
        if (id.endsWith('/src/generated/reg.ts')) {
          await askedOnce
        }
        return null
      },
      transform: {
        order: 'post',
        handler(_code, id) {
          if (id.endsWith('/src/generated/reg.ts')) {
            compiled()
          }
        },
      },
    }
    const server = await startDevServer({
      browser: true,
      start: {
        importProtection: options('mock', {
          allowImport: async () => {
            asked()
            await compiledOnce
            return false
          },
        }),
      },
      files: {
        [denied]: deniedModule,
        'src/generated/reg.ts': plainImporter('generated'),
        'src/generated/glob.ts': patternImporter('vite', '../', false),
        'src/slow.ts': `export { viaPlain } from './generated/reg'\n`,
        'src/entry.ts': `import { viaGlob } from './generated/glob'
import { viaPlain } from './slow'
export { viaPlain, viaGlob }
;(globalThis as any).uses = { plain: viaPlain, glob: viaGlob }
`,
        'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
      },
      plugins: [{ ...plugin, enforce: 'pre' }],
    })
    // (before: the first page got the mock, then the file's own check
    // reloaded it)
    const first = await runViteClient(server, '/src/router.ts', readScript)
    await server.idle()
    const after = await runViteClient(server, '/src/router.ts', readScript)
    expect({ first: first.result, after: after.result }).toEqual({
      first: { plain: 'MARK_SECRET', glob: ['MARK_SECRET'] },
      after: { plain: 'MARK_SECRET', glob: ['MARK_SECRET'] },
    })
  },
  timeout,
)

describe('reports', () => {
  // Finding 4: an exempt importer needs the file as it is, but nothing of
  // it ships (its use is unused, the pattern import too)
  test(
    'vite build: the file compiled as its mock first, nothing of it shipped: nothing reported',
    async () => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler: 'vite',
            files: {
              ...app({ bundler: 'vite', glob: 'generated', first: 'pattern' }),
              'src/generated/reg.ts': `import { secret } from '../lib/db.server'
export const viaPlain = () => 'none'
export const unused = () => secret()
`,
              'src/generated/glob.ts': `const modules = import.meta.glob('../lib/*.server.ts')
export const viaGlob = async () => ['none']
export const unusedGlob = () => modules
`,
            },
            entry: 'src/entry.ts',
            viteConfig: {
              plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
            },
            start: { importProtection: options('error') },
          }),
        ),
      ).toEqual({
        failed: false,
        uses: { plain: 'none', glob: ['none'] },
        reported: [],
        problems: [],
      })
    },
    timeout,
  )

  // Finding 5: the served-mismatch report names the pattern import that
  // brought the file first
  test(
    'vite build: the file compiled as its mock for a pattern import, then needed as it is: the error names the pattern import',
    async () => {
      const files = app({
        bundler: 'vite',
        glob: 'generated',
        first: 'pattern',
      })
      let error: unknown
      try {
        await buildStart({
          bundler: 'vite',
          files,
          entry: 'src/entry.ts',
          viteConfig: {
            plugins: holdUntilCompiled('/src/generated/reg.ts', denied),
          },
          start: { importProtection: options('error') },
        })
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(StartBuildError)
      expectDiagnostic((error as StartBuildError).diagnostics, {
        severity: 'error',
        file: 'src/generated/glob.ts',
        position: diagnosticPosition(
          files['src/generated/glob.ts']!,
          'import.meta.glob',
        ),
      })
    },
    timeout,
  )

  // Finding 5: R89's warning about an exempt pattern importer says that its
  // import is a pattern import, and where
  test.each(['vite', 'rsbuild'] as const)(
    '%s build: an exempt pattern importer alone gets the mock: the warning names its pattern import',
    async (bundler) => {
      const glob = patternImporter(bundler, '../', false)
      const build = await buildStart({
        bundler,
        files: {
          [denied]: deniedModule,
          'src/generated/glob.ts': glob,
          'src/entry.ts': `export { viaGlob } from './generated/glob'\n`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: options('error') },
      })
      expectDiagnostic(build.diagnostics, {
        severity: 'warning',
        file: 'src/generated/glob.ts',
        position: diagnosticPosition(
          glob,
          bundler === 'vite'
            ? 'import.meta.glob'
            : 'import.meta.webpackContext',
        ),
      })
    },
    timeout,
  )
})
