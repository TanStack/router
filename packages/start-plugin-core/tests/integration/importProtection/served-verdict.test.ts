/**
 * A denied file compiled under its own id is one module: real or mocked for
 * every importer at once. R142: the choice depends on its static importers
 * only (real when an exempt importer imports it, else mocked), whatever
 * order the bundler compiles them in and whether a module was compiled now
 * or restored from a persistent cache; a pattern importer
 * (`import.meta.glob`, `import.meta.webpackContext`) gets whatever the file
 * is served, with no report of its own; and no report says "mocked" about a
 * file served real. A Vite build that served the mock before it met the
 * exempt importer follows `behavior` (R142 (2)): its `error` build fails,
 * naming the file. Design 4 (import protection's real-or-mock choice) §5:
 * F5-1, F5-1b, F5-2, F5-6.
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../../build-harness'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn, settledAcrossTurn } from './v2-hosts'
import type { StartBuild } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'
import type { Plugin } from 'vite'

const timeout = 120_000

afterEach(() => {
  delete (globalThis as Record<string, unknown>).uses
})

const denied = 'src/lib/db.server.ts'

/** What a use reads: the real value's text, or `mock`. */
const text = `const text = (value: unknown) =>
  typeof value === 'string' && value.startsWith('MARK_') ? value : 'mock'
`

/** The pattern import of `src/lib/*.server.ts` from `src/<dir>/`, eager or lazy. */
function patternImporter(
  bundler: 'vite' | 'rsbuild',
  depth: string,
  lazy: boolean,
): string {
  const reach =
    bundler === 'vite'
      ? `const modules = import.meta.glob('${depth}lib/*.server.ts'${lazy ? '' : ', { eager: true }'}) as Record<string, any>
const all = () => Promise.all(Object.values(modules).map((m: any) => ${lazy ? 'm()' : 'm'}))
`
      : `const context = import.meta.webpackContext('${depth}lib', { recursive: false, regExp: /\\.server\\.ts$/${lazy ? `, mode: 'lazy'` : ''} })
const all = () => Promise.all(context.keys().map((key: string) => context(key)))
`
  return `${text}${reach}export const viaGlob = async () => (await all()).map((m: any) => text(m.secret()))
`
}

interface Shape {
  bundler: 'vite' | 'rsbuild'
  /** Where the pattern importer lives: `generated` is exempt, `src` is checked. */
  glob: 'generated' | 'src'
  /** Which importer the entry reaches first; the plain one is three modules deep when it comes second. */
  first: 'plain' | 'pattern'
  lazy?: boolean
}

/**
 * The app: `src/generated/reg.ts` (exempt by `exclude`) imports the denied
 * file plainly; the pattern importer reaches it too. The entry exports both
 * uses and puts them on `globalThis.uses` (dev pages).
 */
function app({ bundler, glob, first, lazy = false }: Shape) {
  const globFile =
    glob === 'generated' ? 'src/generated/glob.ts' : 'src/glob.ts'
  const globFrom = glob === 'generated' ? './generated/glob' : './glob'
  const imports = [
    `import { viaPlain } from '${first === 'plain' ? './generated/reg' : './a'}'`,
    `import { viaGlob } from '${globFrom}'`,
  ]
  if (first === 'pattern') {
    imports.reverse()
  }
  return {
    [denied]: `export const secret = () => 'MARK_SECRET'\n`,
    'src/generated/reg.ts': `${text}import { secret } from '../lib/db.server'
export const viaPlain = () => text(secret())
`,
    [globFile]: patternImporter(
      bundler,
      glob === 'generated' ? '../' : './',
      lazy,
    ),
    'src/a.ts': `export { viaPlain } from './b'\n`,
    'src/b.ts': `export { viaPlain } from './c'\n`,
    'src/c.ts': `export { viaPlain } from './generated/reg'\n`,
    'src/entry.ts': `${imports.join('\n')}
export { viaPlain, viaGlob }
;(globalThis as any).uses = { plain: viaPlain, glob: viaGlob }
`,
    'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
  }
}

const options = (
  behavior: 'mock' | 'error',
  extra: ImportProtectionOptions = {},
): ImportProtectionOptions => ({
  behavior,
  mockAccess: 'off',
  exclude: ['src/generated/**'],
  ...extra,
})

/** What a build's two uses read. */
async function uses(build: StartBuild) {
  const { result } = await build.client.run(
    `return { plain: entry.viaPlain(), glob: await entry.viaGlob() }`,
  )
  return result as { plain: string; glob: Array<string> }
}

/** A build's outcome: the uses, the reported client importers and every warning or error; a failed build's errors. */
async function outcomeOf(build: () => Promise<StartBuild>) {
  try {
    const built = await build()
    return {
      failed: false,
      uses: await uses(built),
      reported: importersIn(built, 'client'),
      problems: problems(built.diagnostics).map(({ severity }) => severity),
    }
  } catch (error) {
    if (!(error instanceof StartBuildError)) {
      throw error
    }
    return {
      failed: true,
      errors: problems(error.diagnostics)
        .filter(({ severity }) => severity === 'error')
        .map(({ text }) => text),
    }
  }
}

/** One module, real for both uses, and nothing reported. */
const realForBoth = {
  failed: false,
  uses: { plain: 'MARK_SECRET', glob: ['MARK_SECRET'] },
  reported: [],
  problems: [],
}

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  // F5-1: the exempt importer reached first serves the file real; the
  // checked pattern importer gets it too (R142), and no report says
  // "mocked" (or fails the build on an import that got the real module).
  test.each(['mock', 'error'] as const)(
    'an exempt plain import reached first and a checked pattern import: both get the real module, nothing reported (%s)',
    async (behavior) => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler,
            files: app({ bundler, glob: 'src', first: 'plain' }),
            entry: 'src/entry.ts',
            start: { importProtection: options(behavior) },
          }),
        ),
      ).toEqual(realForBoth)
    },
    timeout,
  )
})

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

  // F5-1 in the other order: the file is served the mock first, then the
  // exempt importer needs it real; Rspack builds it again
  test.each(['mock', 'error'] as const)(
    'a checked pattern import reached first and an exempt plain import: both get the real module, nothing reported (%s)',
    async (behavior) => {
      expect(
        await outcomeOf(() =>
          buildStart({
            bundler: 'rsbuild',
            files: app({ bundler: 'rsbuild', glob: 'src', first: 'pattern' }),
            entry: 'src/entry.ts',
            start: { importProtection: options(behavior) },
          }),
        ),
      ).toEqual(realForBoth)
    },
    timeout,
  )

  // F5-1b: the persistent cache restores the file real after the exempt
  // importer's import was removed: the warm build serves it the mock, as a
  // cold build of the same files does, and reports the checked importer
  test(
    'a persistent cache: the exempt import removed between builds, the checked pattern importer gets the mock and is reported',
    async () => {
      const cold = await buildStart({
        bundler: 'rsbuild',
        rsbuildConfig: { performance: { buildCache: true } },
        files: app({ bundler: 'rsbuild', glob: 'src', first: 'plain' }),
        entry: 'src/entry.ts',
        start: { importProtection: options('mock') },
      })
      expect((await uses(cold)).glob).toEqual(['MARK_SECRET'])
      const warm = await cold.rebuild({
        'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
      })
      expect({
        glob: (await uses(warm)).glob,
        reported: importersIn(warm, 'client'),
        where: warm.client.where('MARK_SECRET'),
      }).toEqual({
        glob: ['mock'],
        reported: ['src/glob.ts'],
        where: 'nowhere',
      })
    },
    timeout,
  )
})

/**
 * Holds the client build's `load` of `held` until Start compiled `first`
 * (a module of the same build): a user plugin that is slow on one file.
 */
function holdUntilCompiled(held: string, first: string): Array<Plugin> {
  let release!: () => void
  const compiled = new Promise<void>((resolve) => (release = resolve))
  return [
    {
      name: 'test:hold-load',
      enforce: 'pre',
      async load(id) {
        if (id.endsWith(held)) {
          await compiled
        }
        return null
      },
    },
    {
      name: 'test:compiled',
      transform: {
        order: 'post',
        handler(_code, id) {
          if (id.endsWith(first)) {
            release()
          }
        },
      },
    },
  ]
}

describe('vite build', () => {
  // F5-2 on Vite, R142 (2): the exempt plain importer is loaded after the
  // denied file was compiled (served the mock) for the exempt pattern
  // importer. A Vite build cannot build the file again: `error` fails,
  // naming the file.
  test.fails(
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
})

/** The dev page's two uses. */
const readScript = `const { plain, glob } = globalThis.uses
return { plain: plain(), glob: await glob() }`

// F5-6, exempt half: an edit removes the exempt plain import; the denied
// file, reached now only by the checked pattern importer, is served the
// mock without a restart (a fresh start serves it the mock)
describe('dev: the exempt import removed by an edit', () => {
  const removed = {
    'src/generated/reg.ts': `export const viaPlain = () => 'none'\n`,
  }

  test.fails(
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
