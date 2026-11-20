/**
 * Rsbuild builds, watch builds and dev servers (RSC off): every compilation
 * settles the modules it builds, a child compilation's included, with the
 * modules that enter it late (SPEC J6.7: a denied file is served as it is
 * only when an exempt or allowed import the app reaches arrives at it).
 * - A child compiler of the server's (a worker plugin's, run in `make` or
 *   in `finishMake`) builds `r.ts` (exempt), which reads `w.client.ts`
 *   (denied) through `pattern.ts` (checked, a context) and names it in an
 *   import the bundler drops (`if (false)`): guessed real on its compile.
 *   No other import arrives at it, so it is its mock, which a child
 *   compiler cannot load: the build fails with the context's violation,
 *   traced through the child's graph (`r.ts` → `pattern.ts` → the file).
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
 * `r.ts` → `w.client.ts`).
 */
import { describe, expect, test } from 'vitest'
import { StartBuildError, buildStart } from '../../build-harness'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import {
  violationRecorder,
  violationsOf,
} from '../../importProtection/start-apps'
import type { Recorded } from '../../importProtection/start-apps'

const timeout = 120_000

const mock = '[import-protection mock]'

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
  type When = 'make' | 'finishMake'

  /** The server environment's config: a plugin running a child compiler of `r.ts` at `when`. */
  const environments = (when: When) => ({
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
                return new Promise<void>((resolve, reject) => {
                  child.runAsChild((error: unknown) =>
                    error ? reject(error) : resolve(),
                  )
                })
              }
              if (when === 'make') {
                compiler.hooks.make.tapPromise('test:child', run)
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
    timeout,
  )

  test(
    'rsbuild build --watch, an edit of the route: the rebuild fails with the context',
    async () => {
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
    },
    timeout,
  )

  test(
    'Rsbuild dev: the first compile and the one after an edit of the route fail with the context',
    async () => {
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
    },
    timeout,
  )
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
    'src/r.ts': `import { marker } from './d.client'
export const run = () => String(marker())
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

  test(
    'Rsbuild build: the provided module serves the mock',
    async () => {
      expect(await served(await build())).toEqual(expected('FIRST'))
    },
    timeout,
  )

  test(
    'Rsbuild build on the persistent cache: the second build serves the mock',
    async () => {
      expect(await served(await build({ builds: 2 }))).toEqual(
        expected('FIRST'),
      )
    },
    timeout,
  )

  test(
    'rsbuild build --watch, a caption edit: the rebuild serves the mock',
    async () => {
      expect(await served(await build({ watchEdits: edited }))).toEqual(
        expected('SECOND'),
      )
    },
    timeout,
  )

  test(
    'Rsbuild dev: the first load and the one after a caption edit serve the mock',
    async () => {
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
    },
    timeout,
  )
})
