/**
 * Rsbuild builds, watch builds and dev servers (RSC off) judge a module
 * the compilation holds by itself as in the app, however it is held, and
 * no other module with no importer (SPEC J6.7: "in the app" is reached
 * from what the compilation holds by itself).
 * A plugin of the server compiler's holds `r.ts` (exempt) by itself: a
 * global include (`compilation.addInclude` with no entry: no entry data
 * lists it), an include of the server entry, or an unnamed `EntryPlugin`
 * entry. `r.ts` imports `d.client.ts` (denied), so it is real whatever
 * imports `r.ts`. `w.client.ts` (denied) is read through `wPattern.ts`
 * (checked, a context) from `g.ts` (exempt), which also names it in an
 * import the bundler drops (`if (false)`): guessed real on the first
 * compile, then lowered. Its real module imports `r.ts`: a module that is a
 * root only while nothing imports it would support `d.client.ts` and lose
 * it again with `w.client.ts`.
 * So `d.client.ts` is real, `w.client.ts` its mock, and the one report is
 * the context's. An include is bundled, not run: the rows read the server
 * output and the reports.
 * The include at stage 0 enters after the settlement's first run: its last
 * run judges it.
 * Source: the RSC phase 1 round 7 gap probe (/var/tmp/rsc-p1-r7/probe,
 * 9b11ccf6be: "could not settle" for the global include, db260cf3a3: R147),
 * design-rsc-phase1-settlement.md amendment 3, V0 to V3, and amendment 4,
 * L5 (the include at stage 0).
 */
import { describe, expect, test } from 'vitest'
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
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'

const timeout = 120_000

const files = {
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
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>home</main>
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
  'src/r.ts': `import { value } from './d.client'
;(globalThis as any).__R = () => 'R:' + String(value())
export {}
`,
  'src/d.client.ts': `import { read } from './g'
export const value = () => 'D:' + String(read())
`,
  'src/g.ts': `import { read as viaPattern } from './wPattern'
if (false) import('./w.client')
export const read = () => String(viaPattern())
`,
  'src/wPattern.ts': `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/w\\.client\\.ts$/,
})
export const read = () => files('./w.client.ts').value()
`,
  'src/w.client.ts': `import './r'
export const value = () => 'W_REAL'
`,
}

/** `g.ts` edited (a comment): the next compilation builds it again. */
const touched = {
  'src/g.ts': `${files['src/g.ts']}// touched\n`,
}

// (`mockAccess: 'off'`: a mock the server calls is not an error of the
// compilation)
const importProtection = {
  behavior: 'mock' as const,
  mockAccess: 'off' as const,
  exclude: ['**/r.ts', '**/g.ts'],
}

/**
 * How the server compiler holds `r.ts` (`late`: a global include at
 * `finishMake` stage 0, after the settlement's first run).
 */
type Hold = 'global include' | 'entry include' | 'unnamed entry' | 'late'

/** The server environment's config: a plugin holding `r.ts` as `hold` says. */
const environments = (hold: Hold) => ({
  ssr: {
    tools: {
      rspack: (config: any, { rspack }: any) => {
        if (hold === 'unnamed entry') {
          config.plugins.push(
            new rspack.EntryPlugin(config.context, './src/r.ts'),
          )
          return
        }
        config.plugins.push({
          apply(compiler: any) {
            compiler.hooks.finishMake.tapAsync(
              { name: 'test:include', stage: hold === 'late' ? 0 : -100 },
              (compilation: any, done: (error?: unknown) => void) => {
                compilation.addInclude(
                  config.context,
                  rspack.EntryPlugin.createDependency('./src/r.ts'),
                  hold === 'entry include' ? { name: 'index' } : {},
                  (error: unknown) => done(error ?? undefined),
                )
              },
            )
          },
        })
      },
    },
  },
})

/** The distinct violations of `recorded`, by importer file and specifier. */
const reported = (recorded: Recorded) =>
  [
    ...new Set(
      violationsOf(recorded).map(({ importer, specifier }) =>
        JSON.stringify({ importer: importer.replace(/:.*/, ''), specifier }),
      ),
    ),
  ]
    .map((v) => JSON.parse(v) as { importer: string; specifier: string })
    .sort((x, y) => x.importer.localeCompare(y.importer))

/** Whether `diagnostics` hold R147 or an internal error of the settlement. */
const settlementErrors = (diagnostics: ReadonlyArray<ChannelDiagnostic>) =>
  diagnostics
    .map(({ text }) => text)
    .filter((text) =>
      /Reached by checked importers|did not settle|could not settle/.test(text),
    )

/** What the source serves: `d.client.ts` real, `w.client.ts` its mock, the context's report. */
const expected = {
  errors: [],
  served: { d: true, w: false },
  reported: [{ importer: 'src/wPattern.ts', specifier: 'src/w.client.ts' }],
}

async function outcome(built: Awaited<ReturnType<typeof buildStart>>) {
  const server = built.ssr.chunks.map(({ code }) => code).join('\n')
  return {
    errors: settlementErrors([...built.firstBuild, ...built.diagnostics]),
    served: { d: /["'`]D:["'`]/.test(server), w: server.includes('W_REAL') },
    reported: reported(built),
  }
}

describe('Rsbuild build, a module the server compiler holds by itself, imported by a denied module served as its mock', () => {
  test.each<Hold>(['global include', 'entry include', 'unnamed entry', 'late'])(
    '%s: the held module supports its imports, the denied importer is its mock',
    async (hold) => {
      const built = await buildStart({
        bundler: 'rsbuild',
        files,
        entry: 'src/entry.ts',
        rsbuildConfig: { environments: environments(hold) } as never,
        start: { importProtection } as never,
      })
      expect(await outcome(built)).toEqual(expected)
    },
    timeout,
  )
})

describe('rsbuild build --watch, the same source after an edit of the exempt importer', () => {
  test.each<Hold>(['global include', 'late'])(
    '%s: the rebuild serves what a fresh build serves',
    async (hold) => {
      const built = await buildStart({
        bundler: 'rsbuild',
        files,
        entry: 'src/entry.ts',
        rsbuildConfig: {
          environments: environments(hold),
        } as never,
        start: { importProtection } as never,
        watchEdits: touched,
      })
      expect(await outcome(built)).toEqual(expected)
    },
    timeout,
  )
})

describe('Rsbuild dev, a module the server compiler holds by itself', () => {
  test(
    'the first compile and the one after an edit report the context, no error',
    async () => {
      const recorder = violationRecorder(importProtection)
      const server = await startRsbuildStartDevServer({
        browser: true,
        config: {
          tools: { htmlPlugin: false },
          environments: environments('global include'),
        } as never,
        start: { importProtection: recorder.importProtection },
        files,
      })
      const state = async (since: number) => {
        await fetch(new URL('/', server.url))
        return {
          errors: [
            ...reportedErrors(server, since),
            ...settlementErrors(server.diagnostics.slice(since)),
          ],
          reported: [
            ...new Set(
              violationsOf({ root: server.root, ...recorder }).map(
                ({ specifier }) => specifier,
              ),
            ),
          ].sort(),
        }
      }
      expect(await state(0)).toEqual({
        errors: [],
        reported: ['src/w.client.ts'],
      })
      const since = server.diagnostics.length
      await server.edit(touched)
      expect(await state(since)).toEqual({
        errors: [],
        reported: ['src/w.client.ts'],
      })
    },
    timeout,
  )
})
