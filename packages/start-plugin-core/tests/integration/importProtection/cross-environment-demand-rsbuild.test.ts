/**
 * An exempt importer's static import is real in the module the bundler
 * resolved it to, in whatever compile environment that module is (SPEC
 * J6.7): an Rsbuild build whose server compiler puts the denied target
 * (or the importer and the target) in layers of the user's, with and
 * without RSC. The twin guard (an exemption in one environment does not
 * make another environment's module of the file real) is
 * react-start-rsc's rsc-dual-layer-dev-rsbuild.test.ts.
 * Source: the RSC phase 1 re-check (/var/tmp/rsc-p1-recheck/report.md §1,
 * probes demand-target-exempt and case-marker-target-ok: 407da6ddac
 * rendered the mock, db260cf3a3 the real value), design-rsc-phase1-graph.md
 * §5.4 R1, R1b, R1c.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { rejection, violationsOf } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'

const timeout = 120_000

const root = {
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
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}

/** The route renders, on the server, what `feature.ts` reads of `private.client.ts`. */
const files = {
  ...root,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../feature'
const label = createIsomorphicFn()
  .server(() => read())
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main data-testid="label">{label()}</main>
}
`,
  'src/feature.ts': `import { denied } from './private.client'
export function read() {
  return denied()
}
`,
  'src/private.client.ts': `export const denied = () => 'EXPECTED_ROUTE_LABEL'\n`,
}

/** The server compiler's module rules of each layout (importer → target). */
const layouts = [
  {
    layout: 'no layer → reports',
    rules: [{ test: /private\.client\.ts$/, layer: 'reports' }],
  },
  {
    layout: 'reports → formatting',
    rules: [
      { test: /feature\.ts$/, layer: 'reports' },
      { test: /private\.client\.ts$/, layer: 'formatting' },
    ],
  },
]

const build = (
  app: Record<string, string>,
  rules: Array<Record<string, unknown>>,
  start: Record<string, unknown>,
  rsc = false,
) =>
  buildStart({
    bundler: 'rsbuild',
    files: app,
    entry: 'src/entry.ts',
    ...(rsc && { symlinks: rsbuildRscLinks() }),
    rsbuildConfig: {
      environments: { ssr: { tools: { rspack: { module: { rules } } } } },
    },
    start: {
      ...(rsc && { rsc: { enabled: true } }),
      importProtection: { behavior: 'error', ...start },
    } as never,
  })

/** The texts of the elements of `html` with `data-testid` `id`. */
const texts = (html: string, id: string) =>
  [...html.matchAll(new RegExp(`data-testid="${id}">([^<]*)<`, 'g'))].map(
    (m) => m[1],
  )

describe('Rsbuild build, a denied target in a layer of the user', () => {
  test.each(layouts)(
    '$layout: the exempt importer gets the real module',
    async ({ rules }) => {
      const built = await build(files, rules, { exclude: ['**/feature.ts'] })
      expect(violationsOf(built)).toEqual([])
      const { url } = await built.preview()
      const html = await (await fetch(new URL('/', url))).text()
      expect(texts(html, 'label')).toEqual(['EXPECTED_ROUTE_LABEL'])
    },
    timeout,
  )

  test.each(layouts)(
    '$layout: a checked importer fails the build, its import reported',
    async ({ rules }) => {
      const failed = await rejection(build(files, rules, {}))
      expect(
        violationsOf(failed).map(({ importer, specifier }) => ({
          importer: importer.replace(/:.*/, ''),
          specifier,
        })),
      ).toEqual([{ importer: 'src/feature.ts', specifier: './private.client' }])
    },
    timeout,
  )

  // the RSC analogue: the exempt server component's marked module, moved to
  // the user's layer, renders its value
  test(
    "RSC: an exempt server component's client-only-marked module in a layer of the user renders",
    async () => {
      const built = await build(
        {
          ...root,
          'src/utils/browserMarked.ts': `import '@tanstack/react-start/client-only'
export const value = () => 'marker value'
`,
          'src/utils/ClientBox.tsx': `'use client'
export function ClientBox() {
  return <span data-testid="client-box">{'client-only label'}</span>
}
`,
          'src/utils/ucServer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox'
import { value } from './browserMarked'
function ServerPart() {
  return (
    <section>
      <i data-testid="marked">{value()}</i>
      <ClientBox />
    </section>
  )
}
export const getUc = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(<ServerPart />),
)
`,
          'src/routes/uc.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { ClientBox } from '../utils/ClientBox'
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
        },
        [{ test: /browserMarked\.ts$/, layer: 'reports' }],
        { exclude: ['**/ucServer.tsx'] },
        true,
      )
      expect(violationsOf(built)).toEqual([])
      const { url } = await built.preview()
      const html = await (await fetch(new URL('/uc', url))).text()
      expect({
        marked: texts(html, 'marked'),
        boxes: texts(html, 'client-box'),
      }).toEqual({
        marked: ['marker value'],
        boxes: ['client-only label', 'client-only label'],
      })
    },
    timeout,
  )
})
