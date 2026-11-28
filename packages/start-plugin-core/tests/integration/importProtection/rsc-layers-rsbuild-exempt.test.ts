/**
 * Server import protection of an Rsbuild RSC build whose `'use client'`
 * `ClientBox` the route and a server component both render (a module in
 * each layer of the server compiler), for the import-protection state the
 * RSC investigation's model audit keys by importer id or path (the edge
 * index, a denied file's own verdict): an exempt component's import is real
 * in both layers (SPEC J6.7), and a component that is itself a denied file
 * is reported whichever layer compiles it (SPEC J6.1), also when an exempt
 * route needs it as it is (the server component's client reference reaches
 * the file itself where SSR renders it, R147). The ledger keyed by
 * layer is rsc-layers-rsbuild.test.ts; the dev rebuilds are react-start-rsc's
 * rsc-dual-layer-dev-rsbuild.test.ts.
 * Source: RSC investigation (rsc-investigation-model.md §4.2 rows 22 and 24,
 * Astra 11-19: both pass in a build; dev rebuilds fail row 22); the exempt
 * route row: the RSC phase 1 reviews (review-rsc-phase1-fable.md §2 case C,
 * /var/tmp/rsc-p1-review/astra/report.md Part B), main fails the build,
 * 88dded8da0 and 55c11d81b8 built it silently, 407da6ddac failed it with
 * no position (design-rsc-phase1-graph.md §5.4 R2d).
 */
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { StartBuildError } from '../../build-harness'
import { buildStart } from '../../build-start'
import { rejection, violationsOf } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'

const timeout = 120_000

/**
 * The app: `ClientBox` (in `file`, importing `./browser.client` with
 * `helper`) rendered by `/uc` and by the server component of `getUc`.
 */
function rscApp(file: string, helper: boolean): Record<string, string> {
  const box = file.replace(/\.tsx$/, '')
  return {
    'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
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
    'src/utils/browser.client.ts': `export function clientLabel(): string {
  return 'client-only label'
}
`,
    [`src/utils/${file}`]: `'use client'
${helper ? `import { clientLabel } from './browser.client'\n` : ''}export function ClientBox() {
  return <span data-testid="client-box">{${helper ? 'clientLabel()' : `'client-only label'`}}</span>
}
`,
    'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './${box}'
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
import { ClientBox } from '../utils/${box}'
import { getUc } from '../utils/ucServer'
export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      <ClientBox />
      {Server}
    </main>
  )
}
`,
    'src/entry.ts': `export {}\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
  }
}

const build = (
  files: Record<string, string>,
  importProtection: Record<string, unknown>,
) =>
  buildStart({
    bundler: 'rsbuild',
    files,
    entry: 'src/entry.ts',
    symlinks: rsbuildRscLinks(),
    start: { rsc: { enabled: true }, importProtection } as never,
  })

describe('Rsbuild RSC build, a client component in both layers', () => {
  // SPEC J6.7: the exempt importer gets the real module in both layers (no
  // report, the real label in both spans).
  test(
    "an exempt component's denied import is real in both layers",
    async () => {
      const built = await build(rscApp('ClientBox.tsx', true), {
        behavior: 'error',
        exclude: ['**/ClientBox.tsx'],
      })
      expect(violationsOf(built)).toEqual([])
      const { url } = await built.preview()
      const html = await (await fetch(new URL('/uc', url))).text()
      expect(
        [...html.matchAll(/data-testid="client-box">([^<]*)</g)].map(
          (m) => m[1],
        ),
      ).toEqual(['client-only label', 'client-only label'])
    },
    timeout,
  )

  // SPEC J6.1: a `'use client'` component that is itself a denied file
  // (`.client.tsx`) is a violation where SSR renders it, whichever layer
  // compiles it last.
  test(
    "a client component that is itself a denied file fails the build with behavior 'error'",
    async () => {
      const failed = await rejection(
        build(rscApp('ClientBox.client.tsx', false), { behavior: 'error' }),
      )
      expect(
        violationsOf(failed).map(({ environment, importer, specifier }) => ({
          environment,
          denied: specifier.endsWith('ClientBox.client'),
          importer: importer.replace(/:.*/, ''),
        })),
      ).toContainEqual({
        environment: 'server',
        denied: true,
        importer: 'src/routes/uc.tsx',
      })
    },
    timeout,
  )

  // the exempt route needs the denied component as it is, and the server
  // component's import of it (checked: allowImport does not allow it) is
  // how SSR, which renders it, gets it: the build fails at that import
  // (main: its import's own report; here R147, one file served one way)
  test(
    "an exempt route and a server component's client reference both render a denied client component: the build fails at the server component's import",
    async () => {
      const failed = await rejection(
        build(rscApp('ClientBox.client.tsx', false), {
          behavior: 'error',
          exclude: ['**/uc.tsx'],
        }),
      )
      expect(failed).toBeInstanceOf(StartBuildError)
      expectDiagnostic(failed.diagnostics, {
        severity: 'error',
        file: 'src/utils/ucServer.tsx',
        position: { line: 3, column: 27 },
      })
    },
    timeout,
  )
})
