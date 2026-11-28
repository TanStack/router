/**
 * Rsbuild builds, watch builds and dev servers (RSC off): every compilation
 * settles the modules it builds, a child compilation's included, with the
 * modules that enter it late (SPEC J6.7: a denied file is served as it is
 * only when an exempt or allowed import the app reaches arrives at it).
 * - A child compiler of the server's (a worker plugin's, run in `make`, in
 *   `finishMake` or in `processAssets`) builds `r.ts` (exempt), which reads `w.client.ts`
 *   (denied) through `pattern.ts` (checked, a context) and names it in an
 *   import the bundler drops (`if (false)`): guessed real on its compile.
 *   No other import arrives at it, so it is its mock, which a child
 *   compiler cannot load: the build fails with the context's violation,
 *   traced through the child's graph (`r.ts` → `pattern.ts` → the file).
 *   A child that fails before its settlement (another plugin's tap) still
 *   reports what it requested, whether the plugin running it goes on or
 *   fails with it, into the run that ran it and no other: a child run in a
 *   `done` tap after Start's fails its run, not the next one, and a run
 *   that fails has `onViolation` answered before the compiler's next run
 *   begins and before the build returns (a rejection of it is handled).
 *   A barrel the child reads, side-effect-free, imports the denied file
 *   and re-exports its binding (two requests of one violation): one error.
 * - `ProvideSharedPlugin` provides `r.ts` (exempt), which imports
 *   `d.client.ts` (denied); the route renders the shared module's value.
 *   The provide-shared module (no file) holds `r.ts`, which the
 *   compilation does not hold by itself, and adds it after the
 *   settlement's first run: `d.client.ts` is its mock, cold, from the
 *   persistent cache, after a watch edit and in dev.
 * Source: the RSC phase 1 re-check 6 (/var/tmp/rsc-p1-recheck6/
 * small-child.py, boundaries.py holders, lateholder.py: 0a261a0259 and
 * db260cf3a3 ran the child's `CHILD_BODY` with no report, and served
 * `HOLDER_REAL` cold), design-rsc-phase1-settlement.md amendment 4, C0 to
 * C4, L1 to L4; re-check 7 (/var/tmp/rsc-p1-recheck7/report.md finding 3,
 * `small-child.py`: 86b46c235e traced the violation to the dropped import,
 * `r.ts` → `w.client.ts`); re-check 8 (/var/tmp/rsc-p1-recheck8/report.md,
 * a child that fails before its closure, `clean8.py`: 99cc175358 reported
 * nothing and built when the plugin went on); re-check 9
 * (/var/tmp/rsc-p1-recheck9/report.md, the two P2 findings, `terminal9.py`:
 * 75d806ac5c failed the next run with the child's error, returned before
 * `onViolation` answered, and left its rejection unhandled; the P3
 * finding, `confirm9.py`: 75d806ac5c and db260cf3a3 printed the barrel's
 * violation twice).
 */
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { StartBuildError } from '../../build-harness'
import { buildStart } from '../../build-start'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import {
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'

/** What a fixture renders for a mock (`describeValue`: by what it does, never by its label, SPEC §5.18). */
const mock = 'a safe mock'

const app = {
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}

/** Whether `texts` hold R147 or an internal error of the settlement. */
const settlementErrors = (texts: ReadonlyArray<string>) =>
  texts.filter((text) =>
    /Reached by checked importers|did not settle|could not settle/.test(text),
  )

/** The distinct denied files `recorded` reports. */
const mocked = (recorded: Recorded) =>
  [...new Set(violationsOf(recorded).map(({ specifier }) => specifier))].sort()

/** The distinct traces `onViolation` received of the violations `recorded` reports, entry first. */
const traces = (recorded: Recorded) =>
  [
    ...new Set(
      violationsOf(recorded).map(({ trace }) =>
        JSON.stringify(trace.map(({ at }) => at)),
      ),
    ),
  ].map((trace) => JSON.parse(trace) as Array<string>)

// (`mockAccess: 'off'`: a mock the server calls is not an error of the
// compilation)
const importProtection = {
  behavior: 'mock' as const,
  mockAccess: 'off' as const,
  exclude: ['**/r.ts'],
}

describe('a child compilation settles the modules it builds', () => {
  const route = (
    caption: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>${caption}</main>
}
`
  /**
   * An edit of the route: the next compilation runs the child compiler
   * again (an edit of a file only a failed child compilation read starts
   * no compilation of the dev server, 0a261a0259 and db260cf3a3 too).
   */
  const edited = { 'src/routes/index.tsx': route('edited') }
  const childFiles = (dropped: boolean) => ({
    ...app,
    'src/routes/index.tsx': route('home'),
    'src/r.ts': `import { read } from './pattern'
${dropped ? "if (false) import('./w.client')\n" : ''};(globalThis as any).readHeld = () => String(read())
export {}
`,
    'src/pattern.ts': `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/w\\.client\\.ts$/,
})
export const read = () => files('./w.client.ts').value()
`,
    'src/w.client.ts': `export const value = () => 'CHILD_BODY'\n`,
  })

  /** When the server compilation runs the child compiler. */
  type When = 'make' | 'finishMake' | 'processAssets'

  /**
   * The server environment's config: a plugin running a child compiler of
   * `r.ts` at `when`. `aborted`: another tap of the child's `finishMake`
   * fails before the settlement's (stage −100), and the plugin goes on
   * (`recover`) or fails with the child's error (`propagate`).
   */
  const environments = (when: When, aborted?: 'recover' | 'propagate') => ({
    ssr: {
      tools: {
        rspack: (config: any) => {
          config.plugins.push({
            apply(compiler: any) {
              const run = (compilation: any) => {
                if (compilation.compiler !== compiler) {
                  return Promise.resolve()
                }
                const child = compilation.createChildCompiler(
                  'held-child',
                  { filename: 'held-child.js' },
                  [
                    new compiler.rspack.EntryPlugin(
                      compiler.context,
                      './src/r.ts',
                      { name: 'child' },
                    ),
                  ],
                )
                if (aborted) {
                  child.hooks.finishMake.tap(
                    { name: 'test:sidecar', stage: -100 },
                    () => {
                      throw new Error('SIDECAR_FAILED')
                    },
                  )
                }
                return new Promise<void>((resolve, reject) => {
                  child.runAsChild((error: unknown) =>
                    error && aborted !== 'recover' ? reject(error) : resolve(),
                  )
                })
              }
              if (when === 'make') {
                compiler.hooks.make.tapPromise('test:child', run)
              } else if (when === 'processAssets') {
                compiler.hooks.thisCompilation.tap(
                  'test:child',
                  (compilation: any) => {
                    compilation.hooks.processAssets.tapPromise(
                      'test:child',
                      () => run(compilation),
                    )
                  },
                )
              } else {
                compiler.hooks.finishMake.tapPromise(
                  { name: 'test:child', stage: -60 },
                  run,
                )
              }
            },
          })
        },
      },
    },
  })

  /** How a build of the child that fails is seen: the denied files reported, no settlement error. */
  async function failure(build: Promise<unknown>) {
    const error = await build.catch((e: unknown) => e)
    expect(error, 'the build fails').toBeInstanceOf(StartBuildError)
    const failed = error as StartBuildError
    return {
      errors: settlementErrors([
        ...failed.errors,
        ...failed.diagnostics.map(({ text }) => text),
      ]),
      reported: mocked(failed),
      context: failed.errors.some((text) => text.includes('src/w.client.ts')),
      traces: traces(failed),
    }
  }

  const expected = {
    errors: [],
    reported: ['src/w.client.ts'],
    context: true,
    // (through the context the child's graph holds, not the dropped import)
    traces: [['src/r.ts:1:22', 'src/pattern.ts', 'src/w.client.ts']],
  }

  test.each<{ when: When; dropped: boolean }>([
    { when: 'make', dropped: true },
    { when: 'finishMake', dropped: true },
    { when: 'make', dropped: false },
  ])(
    'Rsbuild build, the child run in $when, dropped import $dropped: the build fails with the context',
    async ({ when, dropped }) => {
      expect(
        await failure(
          buildStart({
            bundler: 'rsbuild',
            files: childFiles(dropped),
            entry: 'src/entry.ts',
            rsbuildConfig: { environments: environments(when) } as never,
            start: { importProtection } as never,
          }),
        ),
      ).toEqual(expected)
    },
  )

  test.each<{ when: When }>([{ when: 'make' }, { when: 'processAssets' }])(
    'Rsbuild build, the child run in $when failing before its settlement, the plugin going on: the build fails with the context',
    async ({ when }) => {
      expect(
        await failure(
          buildStart({
            bundler: 'rsbuild',
            files: childFiles(false),
            entry: 'src/entry.ts',
            rsbuildConfig: {
              environments: environments(when, 'recover'),
            } as never,
            start: { importProtection } as never,
          }),
        ),
      ).toEqual(expected)
    },
  )

  test('Rsbuild build, the child failing before its settlement, the plugin failing with it: the violation is reported', async () => {
    const error = await buildStart({
      bundler: 'rsbuild',
      files: childFiles(false),
      entry: 'src/entry.ts',
      rsbuildConfig: {
        environments: environments('make', 'propagate'),
      } as never,
      start: { importProtection } as never,
    }).catch((e: unknown) => e)
    expect(error, 'the build fails').toBeInstanceOf(StartBuildError)
    expect(mocked(error as StartBuildError)).toEqual(['src/w.client.ts'])
  })

  test('rsbuild build --watch, an edit of the route: the rebuild fails with the context', async () => {
    expect(
      await failure(
        buildStart({
          bundler: 'rsbuild',
          files: childFiles(true),
          entry: 'src/entry.ts',
          rsbuildConfig: { environments: environments('make') } as never,
          start: { importProtection } as never,
          watchEdits: edited,
        }),
      ),
    ).toEqual(expected)
  })

  test('Rsbuild dev: the first compile and the one after an edit of the route fail with the context', async () => {
    const recorder = violationRecorder(importProtection)
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: {
        tools: { htmlPlugin: false },
        environments: environments('make'),
      } as never,
      start: { importProtection: recorder.importProtection },
      files: childFiles(true),
    })
    const state = async (since: number) => {
      await fetch(new URL('/', server.url))
      const errors = reportedErrors(server, since)
      return {
        errors: settlementErrors(errors),
        reported: mocked({ root: server.root, ...recorder }),
        context: errors.some((text) => text.includes('src/w.client.ts')),
        traces: traces({ root: server.root, ...recorder }),
      }
    }
    expect(await state(0)).toEqual(expected)
    const since = server.diagnostics.length
    await server.edit(edited)
    expect(await state(since)).toEqual(expected)
  })

  describe('what a child requested is reported into the run that ran it', () => {
    /** A promise of the end of `ms` milliseconds. */
    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))

    /**
     * How long an `onViolation` waits for what must not happen before it
     * answers (the next run beginning, the build returning): a run that does
     * not wait for the answer begins or returns within milliseconds; a run
     * that waits does neither, so the bound is the time each of those tests
     * takes.
     */
    const answerBound = 250

    /** What one run of the server compiler ended with: whether its errors name the denied file, or `failed`. */
    type Outcome = boolean | 'failed'

    /**
     * The server environment's config: a plugin running a child compiler of
     * `r.ts` in the compiler's first run only, at `when` (`make`, or a
     * `done` tap after Start's), whose `finishMake` fails before the
     * settlement's (stage −100, `aborted`: the plugin goes on, `recover`, or
     * fails with the child's error, `propagate`). `outcomes`: each run's
     * outcome, as the compiler's last `done` tap sees it; `onCompilation`:
     * called when a compilation of the compiler begins.
     */
    const firstRunChild = (options: {
      when: 'make' | 'done'
      aborted?: 'recover' | 'propagate'
      outcomes: Array<Outcome>
      onCompilation?: () => void
    }) => ({
      ssr: {
        tools: {
          rspack: (config: any) => {
            config.plugins.push({
              apply(compiler: any) {
                let ran = false
                const run = (compilation: any) => {
                  if (compilation.compiler !== compiler || ran) {
                    return Promise.resolve()
                  }
                  ran = true
                  const child = compilation.createChildCompiler(
                    'held-child',
                    { filename: 'held-child.js' },
                    [
                      new compiler.rspack.EntryPlugin(
                        compiler.context,
                        './src/r.ts',
                        { name: 'child' },
                      ),
                    ],
                  )
                  if (options.aborted) {
                    child.hooks.finishMake.tap(
                      { name: 'test:sidecar', stage: -100 },
                      () => {
                        throw new Error('SIDECAR_FAILED')
                      },
                    )
                  }
                  return new Promise<void>((resolve, reject) => {
                    child.runAsChild((error: unknown) =>
                      error && options.aborted === 'propagate'
                        ? reject(error)
                        : resolve(),
                    )
                  })
                }
                if (options.when === 'make') {
                  compiler.hooks.make.tapPromise('test:child', run)
                } else {
                  compiler.hooks.done.tapPromise(
                    { name: 'test:child', stage: 1000 },
                    (stats: any) => run(stats.compilation),
                  )
                }
                compiler.hooks.thisCompilation.tap('test:runs', () =>
                  options.onCompilation?.(),
                )
                compiler.hooks.done.tap(
                  { name: 'test:runs', stage: 2000 },
                  (stats: any) => {
                    const { errors = [] } = stats.toJson({
                      all: false,
                      errors: true,
                    })
                    options.outcomes.push(
                      errors.some((error: { message: string }) =>
                        error.message.includes('src/w.client.ts'),
                      ),
                    )
                  },
                )
                compiler.hooks.failed.tap('test:runs', () => {
                  options.outcomes.push('failed')
                })
              },
            })
          },
        },
      },
    })

    /** Two runs of one compiler of the app (`createCompiler()`, `files` over the child's), the child in the first: what the last one gave. */
    const twoRuns = (
      environments: ReturnType<typeof firstRunChild>,
      onViolation?: (info: { specifier: string }) => Promise<void>,
      files: Record<string, string> = {},
    ) =>
      buildStart({
        bundler: 'rsbuild',
        files: { ...childFiles(false), ...files },
        entry: 'src/entry.ts',
        rsbuildConfig: { environments } as never,
        start: { importProtection: { ...importProtection, onViolation } },
        builds: 2,
        samePlugins: true,
        rsbuildCompiler: true,
      }).then(
        () => 'built',
        (error: unknown) =>
          error instanceof StartBuildError ? error.errors : error,
      )

    test('a child run in a done tap after Start’s, failing before its settlement, the plugin going on: the run fails with the context, the next one builds', async () => {
      const outcomes: Array<Outcome> = []
      const last = await twoRuns(
        firstRunChild({ when: 'done', aborted: 'recover', outcomes }),
      )
      expect({ outcomes, last }).toEqual({
        outcomes: [true, false],
        last: 'built',
      })
    })

    test('a child failing before its settlement, the plugin failing with it, onViolation answering after the next run began or 250 ms: the next run begins once it answered, and builds', async () => {
      const outcomes: Array<Outcome> = []
      const events: Array<string> = []
      let nextCompilation = () => {}
      const last = await twoRuns(
        firstRunChild({
          when: 'make',
          aborted: 'propagate',
          outcomes,
          onCompilation: () => {
            events.push('compilation')
            nextCompilation()
          },
        }),
        async () => {
          await Promise.race([
            new Promise<void>((resolve) => {
              nextCompilation = resolve
            }),
            delay(answerBound),
          ])
          events.push('answered')
        },
      )
      expect({ outcomes, events, last }).toEqual({
        outcomes: ['failed', false],
        events: ['compilation', 'answered', 'compilation'],
        last: 'built',
      })
    })

    test('a child failing before its settlement with two violations, the plugin failing with it, onViolation rejecting: both are told, the next run builds, and nothing is left unhandled', async () => {
      const unhandled: Array<unknown> = []
      const listener = (reason: unknown) => {
        unhandled.push(String(reason))
      }
      process.on('unhandledRejection', listener)
      try {
        const outcomes: Array<Outcome> = []
        const told: Array<string> = []
        const last = await twoRuns(
          firstRunChild({ when: 'make', aborted: 'propagate', outcomes }),
          (info) => {
            told.push(info.specifier)
            return Promise.reject(new Error('CALLBACK_REJECTED'))
          },
          {
            // (`two.ts`, checked, imports two denied files)
            'src/r.ts': `import { read } from './two'
;(globalThis as any).readHeld = () => String(read())
export {}
`,
            'src/two.ts': `import { value as w } from './w.client'
import { value as v } from './v.client'
export const read = () => w() + v()
`,
            'src/v.client.ts': `export const value = () => 'OTHER_BODY'\n`,
          },
        )
        // (a rejection is unhandled once the microtasks after it ran)
        await delay(0)
        expect({ outcomes, told: told.sort(), last, unhandled }).toEqual({
          outcomes: ['failed', false],
          told: ['./v.client', './w.client'],
          last: 'built',
          unhandled: [],
        })
      } finally {
        process.off('unhandledRejection', listener)
      }
    })

    test('Rsbuild build, a child failing before its settlement, the plugin failing with it, onViolation answering after the build returned or 250 ms: the build returns once it answered', async () => {
      const events: Array<string> = []
      let returned = () => {}
      const build = buildStart({
        bundler: 'rsbuild',
        files: childFiles(false),
        entry: 'src/entry.ts',
        rsbuildConfig: {
          environments: firstRunChild({
            when: 'make',
            aborted: 'propagate',
            outcomes: [],
          }),
        } as never,
        start: {
          importProtection: {
            ...importProtection,
            onViolation: async () => {
              await Promise.race([
                new Promise<void>((resolve) => {
                  returned = resolve
                }),
                delay(answerBound),
              ])
              events.push('answered')
            },
          },
        },
      })
      const error = await build.then(
        () => null,
        (e: unknown) => {
          events.push('returned')
          returned()
          return e
        },
      )
      expect(error, 'the build fails').toBeInstanceOf(StartBuildError)
      expect(events).toEqual(['answered', 'returned'])
    })

    test('Rsbuild build, side-effect-free, the child reading a barrel that imports the denied file and re-exports its binding: the build fails with one error of the violation', async () => {
      // (Rspack resolves the barrel's import of the denied file twice when
      // the package is side-effect-free: the import and the re-export)
      const error = await buildStart({
        bundler: 'rsbuild',
        files: {
          ...childFiles(false),
          'src/r.ts': `import { read } from './relay'
;(globalThis as any).readHeld = () => String(read())
export {}
`,
          'src/relay.ts': `import { read } from './w.client'
export { read }
`,
          'src/w.client.ts': `export const read = () => 'CHILD_BODY'\n`,
        },
        sideEffects: false,
        entry: 'src/entry.ts',
        rsbuildConfig: { environments: environments('make') } as never,
        start: { importProtection } as never,
      }).catch((e: unknown) => e)
      expect(error, 'the build fails').toBeInstanceOf(StartBuildError)
      const failed = error as StartBuildError
      expect({
        errors: failed.errors.filter((text) => text.includes('src/w.client.ts'))
          .length,
        told: failed.violations.length,
      }).toEqual({ errors: 1, told: 1 })
    })
  })
})

describe('a module a file-less holder adds after the settlement first ran', () => {
  const route = (
    caption: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
const shared = createIsomorphicFn()
  .server(async () => {
    await __webpack_init_sharing__('default')
    const offered = (__webpack_share_scopes__ as any).default.offered
    const factory = await (Object.values(offered)[0] as any).get()
    return String(factory().run())
  })
  .client(() => 'client control')
export const Route = createFileRoute('/')({
  loader: () => shared(),
  component: Home,
})
function Home() {
  return <main data-testid="label">{'${caption} ' + Route.useLoaderData()}</main>
}
`
  const files = {
    ...app,
    'src/routes/index.tsx': route('FIRST'),
    // (`describeValue` without a secret: the test reads the real code's
    // bytes, `real`)
    'src/r.ts': `import { marker } from './d.client'
${describeValuePrelude}
export const run = () => describeValue(marker())
`,
    'src/d.client.ts': `export const marker = () => 'HOLDER_REAL'\n`,
  }
  const edited = { 'src/routes/index.tsx': route('SECOND') }

  /** The server environment's config: `r.ts` provided to the default share scope. */
  const environments = {
    ssr: {
      tools: {
        rspack: (config: any, { rspack }: any) => {
          config.plugins.push(
            new rspack.sharing.ProvideSharedPlugin({
              shareScope: 'default',
              provides: {
                './src/r.ts': {
                  shareKey: 'offered',
                  version: '1.0.0',
                  eager: true,
                },
              },
            }),
          )
        },
      },
    },
  }

  /** The texts of the elements of `html` with `data-testid` `id`. */
  const texts = (html: string, id: string) =>
    [...html.matchAll(new RegExp(`data-testid="${id}">([^<]*)<`, 'g'))].map(
      (m) => m[1],
    )

  const build = (
    options: { builds?: number; watchEdits?: Record<string, string> } = {},
  ) =>
    buildStart({
      bundler: 'rsbuild',
      files,
      entry: 'src/entry.ts',
      rsbuildConfig: {
        environments,
        ...(options.builds && { performance: { buildCache: true } }),
      } as never,
      start: { importProtection } as never,
      ...options,
    })

  async function served(built: Awaited<ReturnType<typeof build>>) {
    const server = built.ssr.chunks.map(({ code }) => code).join('\n')
    const { url } = await built.preview()
    const response = await fetch(new URL('/', url))
    return {
      status: response.status,
      label: texts(await response.text(), 'label'),
      real: server.includes('HOLDER_REAL'),
      errors: settlementErrors([
        ...built.firstBuild.map(({ text }) => text),
        ...built.diagnostics.map(({ text }) => text),
      ]),
    }
  }

  const expected = (caption: string) => ({
    status: 200,
    label: [`${caption} ${mock}`],
    real: false,
    errors: [],
  })

  test('Rsbuild build: the provided module serves the mock', async () => {
    expect(await served(await build())).toEqual(expected('FIRST'))
  })

  test('Rsbuild build on the persistent cache: the second build serves the mock', async () => {
    expect(await served(await build({ builds: 2 }))).toEqual(expected('FIRST'))
  })

  test('rsbuild build --watch, a caption edit: the rebuild serves the mock', async () => {
    expect(await served(await build({ watchEdits: edited }))).toEqual(
      expected('SECOND'),
    )
  })

  test('Rsbuild dev: the first load and the one after a caption edit serve the mock', async () => {
    const recorder = violationRecorder(importProtection)
    const server = await startRsbuildStartDevServer({
      browser: true,
      config: { tools: { htmlPlugin: false }, environments } as never,
      start: { importProtection: recorder.importProtection },
      files,
    })
    const page = async (since: number) => {
      const response = await fetch(new URL('/', server.url))
      return {
        status: response.status,
        label: texts(await response.text(), 'label'),
        errors: reportedErrors(server, since),
      }
    }
    expect(await page(0)).toEqual({
      status: 200,
      label: [`FIRST ${mock}`],
      errors: [],
    })
    const since = server.diagnostics.length
    await server.edit(edited)
    expect(await page(since)).toEqual({
      status: 200,
      label: [`SECOND ${mock}`],
      errors: [],
    })
  })
})
