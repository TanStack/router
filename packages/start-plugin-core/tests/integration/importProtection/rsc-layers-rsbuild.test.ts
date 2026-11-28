/**
 * Server import protection of an Rsbuild RSC build, whose server environment
 * compiles a module in two layers: SSR (what routes render) and RSC (what
 * server components and server fns run). A `'use client'` component is
 * rendered by SSR, and in the RSC layer it is a client reference: only its
 * SSR use keeps what it imports. Its denied import is reported whichever
 * layer compiles it first.
 * Source: research (the second layer's compile of the component dropped the
 * first layer's violation, so an SSR-first build reported nothing; main
 * fails it).
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { buildStart } from '../../build-start'
import {
  expectPrinted,
  rejection,
  violationsOf,
} from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'
import type {
  StartBuild,
  StartBuildError,
  StartBuildOptions,
} from '../../build-harness'

const timeout = 120_000

/**
 * An RSC app whose `'use client'` `ClientBox` imports a `.client` file
 * (denied on the server by default). A server component renders it inside
 * a server fn's RSC payload; with `routeImports`, the `/uc` route renders
 * it directly too (the SSR layer compiles it before the RSC layer).
 */
function rscApp(routeImports: boolean): Record<string, string> {
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
    'src/utils/ClientBox.tsx': `'use client'
import { clientLabel } from './browser.client'
export function ClientBox() {
  return <span>{clientLabel()}</span>
}
`,
    'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox'
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
import { getUc } from '~/utils/ucServer'
${routeImports ? `import { ClientBox } from '~/utils/ClientBox'\n` : ''}export const Route = createFileRoute('/uc')({
  loader: async () => ({ Server: await getUc() }),
  component: Uc,
})
function Uc() {
  const { Server } = Route.useLoaderData()
  return (
    <main>
      ${routeImports ? '<ClientBox />' : ''}
      {Server}
    </main>
  )
}
`,
    'src/entry.ts': `export {}\n`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        jsx: 'react-jsx',
        paths: { '~/*': ['./src/*'] },
      },
    }),
  }
}

/** `@tanstack/react-start`'s RSC option (not one of every framework's Start config). */
const rscEnabled = { rsc: { enabled: true } }

/** A build of the RSC app with import protection's `behavior`. */
function buildRscApp(
  routeImports: boolean,
  behavior: 'error' | 'mock',
  options: Partial<StartBuildOptions> = {},
) {
  return buildStart({
    bundler: 'rsbuild',
    files: rscApp(routeImports),
    entry: 'src/entry.ts',
    symlinks: rsbuildRscLinks(),
    start: { ...rscEnabled, importProtection: { behavior } },
    ...options,
  })
}

/**
 * The build reported one violation, `ClientBox.tsx` importing
 * `./browser.client` on the server, to `onViolation` and printed at the
 * importer with `severity` (and nothing else as a warning or error).
 */
function expectClientBoxReport(
  recorded: StartBuild | StartBuildError,
  severity: 'error' | 'warning',
) {
  const reports = violationsOf(recorded)
  expect(reports).toEqual([
    expect.objectContaining({
      environment: 'server',
      importer: expect.stringMatching(/^src\/utils\/ClientBox\.tsx(:|$)/),
      specifier: './browser.client',
    }),
  ])
  expectPrinted(recorded.diagnostics, recorded.root, reports[0]!, severity)
  if (severity === 'warning') {
    expect(problems(recorded.diagnostics)).toHaveLength(1)
  }
}

describe.each([
  { order: 'SSR layer first', routeImports: true },
  { order: 'RSC layer first', routeImports: false },
])('Rsbuild RSC build, $order', ({ routeImports }) => {
  test(
    "behavior 'error' fails the build on the client component's .client import",
    async () => {
      expectClientBoxReport(
        await rejection(buildRscApp(routeImports, 'error')),
        'error',
      )
    },
    timeout,
  )

  test(
    "behavior 'mock' warns once and tells onViolation once",
    async () => {
      expectClientBoxReport(await buildRscApp(routeImports, 'mock'), 'warning')
    },
    timeout,
  )
})

describe('Rsbuild RSC build restored from the persistent cache, SSR layer first', () => {
  // (the second build restores the SSR layer's component and replays its
  // record; the RSC layer's is compiled again)
  test(
    "behavior 'mock' warns once and tells onViolation once",
    async () => {
      const warm = await buildRscApp(true, 'mock', {
        builds: 2,
        rsbuildConfig: { performance: { buildCache: true } },
      })
      expectClientBoxReport(warm, 'warning')
    },
    timeout,
  )
})
