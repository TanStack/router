/**
 * A server component's import of a `'use client'` file that a server rule
 * denies (`ClientBox.client.tsx`, `**\/*.client.*`), in Vite and Rsbuild
 * production builds with RSC: the import is an import like any other of
 * the `rsc` environment (SPEC J6.1, J6.3; user decision 2026-11-20, option
 * B of design-rsc-phase1-graph.md §4). `allowImport` is asked about it once
 * with the environment of the file that has it (`rsc`), its importer, its
 * specifier as written and its position; what it answers is what SSR,
 * which renders the file as a client component, gets. A denied one is
 * reported at that position, also when another importer needs the file as
 * it is (R147).
 * Source: the RSC phase 1 re-check (/var/tmp/rsc-p1-recheck/report.md §2,
 * probes case-legacy-all and case-legacy-route: 407da6ddac failed the
 * allow-all app with R147, db260cf3a3 never asked the server component's
 * import; the Vite build failed it too on both), design-rsc-phase1-graph.md
 * §5.4 R2, R2b, R2c, R2e; R5: the server component a report names is the
 * one importing the file, also when it is not its chunk's entry or its
 * chunk is shared (on Vite, the file's importer in SSR is plugin-rsc's
 * client-reference module, named after the chunk's entry or after none:
 * 407da6ddac and db260cf3a3 named the entry, or mocked silently).
 */
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect } from 'vitest'
import { test } from './test'
import type { RscFixtures } from './test'

const timeout = 120_000

/** `ClientBox` rendered by the server component of `getUc`, and by the route `/uc` too with `route`. */
function app(route: boolean): Record<string, string> {
  return {
    'src/utils/ClientBox.client.tsx': `'use client'
export function ClientBox() {
  return <span data-testid="client-box">{'client-only label'}</span>
}
`,
    'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox.client'
function ServerPart() {
  return (
    <section>
      <ClientBox />
    </section>
  )
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`,
    'src/routes/uc.tsx': `import { createFileRoute } from '@tanstack/react-router'
${route ? `import { ClientBox } from '../utils/ClientBox.client'\n` : ''}import { getUc } from '../utils/ucServer'
export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      ${route ? '<ClientBox />' : ''}
      {Server}
    </main>
  )
}
`,
  }
}

interface Asked {
  env: string
  importer: string
  specifier: string
  importerLoc?: { line: number; column: number }
}

/** Each call of `allowImport` (`env`, importer by file name, `specifier`, `line:column`), sorted. */
const imports = (asked: Array<Asked>) =>
  asked
    .map(
      (a) =>
        `${a.env} ${a.importer.split('/').pop()} ${a.specifier}${a.importerLoc ? ` ${a.importerLoc.line}:${a.importerLoc.column}` : ''}`,
    )
    .sort()

const hosts = [
  { host: 'Vite', bundler: 'vite' },
  { host: 'Rsbuild', bundler: 'rsbuild' },
] as const

/** Builds and serves the app on `host` with `importProtection` over `behavior: 'error'`; the labels of `/uc`. */
async function labels(
  serve: RscFixtures['serveRscBuild'],
  bundler: 'vite' | 'rsbuild',
  files: Record<string, string>,
  importProtection: Record<string, unknown>,
): Promise<Array<string>> {
  const server = await serve({
    bundler,
    files,
    start: { importProtection: { behavior: 'error', ...importProtection } },
  })
  const html = await (await fetch(new URL('/uc', server.url))).text()
  return [...html.matchAll(/data-testid="client-box">([^<]*)</g)].map(
    (m) => m[1]!,
  )
}

describe.each(hosts)('$host build with RSC', ({ bundler }) => {
  test(
    "the route and the server component import a denied 'use client' file, allowImport allows both: each is asked once, the page renders",
    async ({ serveRscBuild }) => {
      const asked: Array<Asked> = []
      expect(
        await labels(serveRscBuild, bundler, app(true), {
          allowImport: (info: Asked) => {
            asked.push(info)
            return true
          },
        }),
      ).toEqual(['client-only label', 'client-only label'])
      expect(imports(asked)).toEqual([
        'rsc ucServer.tsx ./ClientBox.client 3:27',
        'ssr uc.tsx ../utils/ClientBox.client 2:27',
      ])
    },
    timeout,
  )

  test(
    "allowImport allows the route's import only: the build fails at the server component's import",
    async ({ serveRscBuild }) => {
      const failed = await labels(serveRscBuild, bundler, app(true), {
        allowImport: (info: Asked) => info.importer.endsWith('/uc.tsx'),
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(failed).toBeInstanceOf(Error)
      expectDiagnostic(failed, {
        severity: 'error',
        file: 'src/utils/ucServer.tsx',
        position: { line: 3, column: 27 },
      })
    },
    timeout,
  )

  test(
    'the server component alone imports it, allowImport allows it: its import is asked about, the page renders',
    async ({ serveRscBuild }) => {
      const asked: Array<Asked> = []
      expect(
        await labels(serveRscBuild, bundler, app(false), {
          allowImport: (info: Asked) => {
            asked.push(info)
            return true
          },
        }),
      ).toEqual(['client-only label'])
      expect(imports(asked)).toEqual([
        'rsc ucServer.tsx ./ClientBox.client 3:27',
      ])
    },
    timeout,
  )

  // each import statement is an edge with its own answer: the denied one
  // fails the build whichever comes first.
  // Source: the RSC phase 1 re-check 2 (/var/tmp/rsc-p1-recheck2/report.md
  // §2, `isolated.py aliases_only`: 2f8afeccc0 built the allowed-first app
  // with zero reports and failed the denied-first one)
  test.for([
    { order: 'allowed first', deniedFirst: false, line: 4 },
    { order: 'denied first', deniedFirst: true, line: 3 },
  ])(
    'the server component imports it twice, allowImport allows one spelling ($order): the build fails at the denied import',
    { timeout },
    async ({ deniedFirst, line }, { serveRscBuild }) => {
      const allowed = `import { ClientBox } from './ClientBox.client'`
      const denied = `import { ClientBox as Another } from './ClientBox.client.tsx'`
      const files = app(false)
      files['src/utils/ucServer.tsx'] = files[
        'src/utils/ucServer.tsx'
      ]!.replace(
        `${allowed}\n`,
        `${deniedFirst ? `${denied}\n${allowed}` : `${allowed}\n${denied}`}\n`,
      ).replace('<ClientBox />', '<ClientBox />\n      <Another />')
      const failed = await labels(serveRscBuild, bundler, files, {
        allowImport: (info: Asked) => !info.specifier.endsWith('.tsx'),
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(failed).toBeInstanceOf(Error)
      expectDiagnostic(failed, {
        severity: 'error',
        file: 'src/utils/ucServer.tsx',
        position: { line, column: 38 },
      })
    },
  )

  test(
    'an exempt server component alone imports it: the page renders, nothing is reported',
    async ({ serveRscBuild }) => {
      const reported: Array<unknown> = []
      expect(
        await labels(serveRscBuild, bundler, app(false), {
          exclude: ['**/ucServer.tsx'],
          onViolation: (info: unknown) => {
            reported.push(info)
          },
        }),
      ).toEqual(['client-only label'])
      expect(reported).toEqual([])
    },
    timeout,
  )
})

/** A `'use client'` button. */
const comp = `'use client'
export function Comp() {
  return <button data-testid="comp">comp</button>
}
`

/** A route `/${name}` whose server fn renders `ServerChart` (`src/n/ServerChart.tsx`), which renders `Comp` of `src/n/Comp.client.tsx`. */
const nestedRoute = (name: string): Record<string, string> => ({
  [`src/${name}/page.tsx`]: `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ServerChart } from '../n/ServerChart'
export const get = createServerFn().handler(() =>
  renderServerComponent(<div>SERVER_ROOT <ServerChart /></div>),
)
`,
  [`src/routes/${name}.tsx`]: `import { createFileRoute } from '@tanstack/react-router'
import { get } from '../${name}/page'
export const Route = createFileRoute('/${name}')({
  loader: async () => ({ tree: await get() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
})

describe.each(hosts)(
  '$host build with RSC, a denied file a nested server component renders',
  ({ bundler }) => {
    test.for([
      { layout: "not its chunk's entry", routes: ['n'] },
      { layout: 'in a chunk two server fns share', routes: ['n', 'm'] },
    ])(
      '$layout: the build fails, reporting the import of the server component that renders it',
      { timeout },
      async ({ routes }, { serveRscBuild }) => {
        const reported: Array<Asked> = []
        const failed = await serveRscBuild({
          bundler,
          files: {
            'src/n/Comp.client.tsx': comp,
            'src/n/ServerChart.tsx': `import { Comp } from './Comp.client'
export function ServerChart() {
  return <section>NESTED <Comp /></section>
}
`,
            ...Object.assign({}, ...routes.map(nestedRoute)),
          },
          start: {
            importProtection: {
              behavior: 'error',
              onViolation: (info: Asked) => {
                reported.push(info)
              },
            },
          },
        }).then(
          () => null,
          (error: unknown) => error,
        )
        expect(failed).toBeInstanceOf(Error)
        expect(
          [
            ...new Set(
              reported.map(
                (r) => `${r.env} ${r.importer.split('/').pop()} ${r.specifier}`,
              ),
            ),
          ].sort(),
        ).toEqual(['rsc ServerChart.tsx ./Comp.client'])
      },
    )
  },
)
