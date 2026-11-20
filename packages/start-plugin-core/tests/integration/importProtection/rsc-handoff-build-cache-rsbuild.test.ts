/**
 * An Rsbuild RSC build on the persistent cache (`performance.buildCache`)
 * whose route and server component import a denied `'use client'` file
 * (rsc-use-client-handoff.test.ts in react-start-rsc: the import is asked
 * and reported in `rsc`): a second build restores the modules from the
 * cache, replaying the server component's import (a handoff, which no
 * edge module records) and the file's mark of client references, and asks
 * `allowImport` about the import again: a policy that changed between the
 * builds decides, as in a cold build.
 * Source: design-rsc-phase1-graph.md §5.4 R4 (the persisted handoff
 * records and client-reference mark, record version 4). Seen while writing
 * it: the second build restores the SSR layer's modules and compiles the
 * RSC layer's provider modules again (the server-fn resolver's rebuild), so
 * the server component's import is asked by its compile.
 */
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { rejection, violationsOf } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'

const timeout = 120_000

/** `ClientBox` rendered by the server component of `getUc`, and by the route `/uc` too with `route`. */
function app(route: boolean): Record<string, string> {
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
    'src/entry.ts': `export {}\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
  }
}

interface Asked {
  env: string
  importer: string
  specifier: string
}

/**
 * Builds the app allowing every import; `again` builds it again on its
 * cache with `allow` (`asked`: what that build asked `allowImport`, by
 * environment and importer file).
 */
async function cached(route: boolean, allow: (info: Asked) => boolean) {
  let policy: (info: Asked) => boolean = () => true
  const asked: Array<string> = []
  const cold = await buildStart({
    bundler: 'rsbuild',
    files: app(route),
    entry: 'src/entry.ts',
    symlinks: rsbuildRscLinks(),
    rsbuildConfig: { performance: { buildCache: true } },
    start: {
      rsc: { enabled: true },
      importProtection: {
        behavior: 'error',
        allowImport: (info: Asked) => {
          asked.push(`${info.env} ${info.importer.split('/').pop()}`)
          return policy(info)
        },
      },
    } as never,
  })
  return {
    asked,
    again: () => {
      policy = allow
      asked.length = 0
      return cold.rebuild()
    },
  }
}

/** The texts of the client boxes of `/uc`. */
async function boxes(build: { preview: () => Promise<{ url: string }> }) {
  const { url } = await build.preview()
  const html = await (await fetch(new URL('/uc', url))).text()
  return [...html.matchAll(/data-testid="client-box">([^<]*)</g)].map(
    (m) => m[1],
  )
}

describe('Rsbuild RSC build on the persistent cache', () => {
  test(
    "allowImport allows both imports again: the server component's import is asked again, the page renders",
    async () => {
      const { asked, again } = await cached(true, () => true)
      const warm = await again()
      expect([...new Set(asked)]).toContain('rsc ucServer.tsx')
      expect(await boxes(warm)).toEqual([
        'client-only label',
        'client-only label',
      ])
    },
    timeout,
  )

  test(
    "allowImport now allows the route's import only: the build fails at the server component's import",
    async () => {
      const { again } = await cached(true, (info) =>
        info.importer.endsWith('/uc.tsx'),
      )
      const failed = await rejection(again())
      expectDiagnostic(failed.diagnostics, {
        severity: 'error',
        file: 'src/utils/ucServer.tsx',
        position: { line: 3, column: 27 },
      })
    },
    timeout,
  )

  test(
    'the server component alone imports it, allowImport now allows nothing: the build fails, its import reported in rsc',
    async () => {
      const { again } = await cached(false, () => false)
      const failed = await rejection(again())
      expect(
        violationsOf(failed).map(({ importer, specifier }) => ({
          importer,
          specifier,
        })),
      ).toContainEqual({
        importer: 'src/utils/ucServer.tsx:3:27',
        specifier: './ClientBox.client',
      })
    },
    timeout,
  )
})
