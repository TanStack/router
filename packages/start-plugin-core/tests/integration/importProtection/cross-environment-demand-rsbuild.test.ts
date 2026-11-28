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
 * §5.4 R1, R1b, R1c. A denied target whose real module brings another
 * through an exempt file, each in a layer of its own: the second one's
 * layer is found while the settlement builds the first (the RSC phase 1
 * re-check 3, /var/tmp/rsc-p1-recheck3/report.md §1, `nested.py`:
 * 2169b4165c served the second one's mock, db260cf3a3 the real value;
 * design-rsc-phase1-settlement.md S1, S1c).
 */
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { buildStart } from '../../build-start'
import { rejection, violationsOf } from '../../importProtection/start-apps'
import { rsbuildRscLinks } from '../../start-plugins'

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
  )

  // the target the settlement builds real calls a server fn of a file
  // nothing else imports: the build's server-fn resolver has it.
  // Source: the RSC phase 1 re-check 2 (/var/tmp/rsc-p1-recheck2/report.md
  // §1, `isolated.py simple`: 2f8afeccc0 answered 500 "Server function info
  // not found", db260cf3a3 rendered `LATE_FN_VALUE`)
  test("RSC: the exempt importer's real module calls a server fn only it imports: the page renders its value", async () => {
    const built = await build(
      {
        ...files,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../feature'
const label = createIsomorphicFn()
  .server(() => read())
  .client(() => 'client control')
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await label() }),
  component: Home,
})
function Home() {
  return <main data-testid="label">{Route.useLoaderData().value}</main>
}
`,
        'src/onlyFn.ts': `import { createServerFn } from '@tanstack/react-start'
export const onlyFn = createServerFn().handler(() => 'LATE_FN_VALUE')
`,
        'src/private.client.ts': `import { onlyFn } from './onlyFn'
export const denied = () => onlyFn()
`,
      },
      layouts[0]!.rules,
      { exclude: ['**/feature.ts'] },
      true,
    )
    expect(violationsOf(built)).toEqual([])
    const { url } = await built.preview()
    const response = await fetch(new URL('/', url))
    expect({
      status: response.status,
      label: texts(await response.text(), 'label'),
    }).toEqual({ status: 200, label: ['LATE_FN_VALUE'] })
  })

  // the RSC analogue: the exempt server component's marked module, moved to
  // the user's layer, renders its value
  test("RSC: an exempt server component's client-only-marked module in a layer of the user renders", async () => {
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
  })
})

/**
 * `feature.ts` (exempt) imports `upper.client.ts`, whose real module imports
 * `bridge.ts` (exempt), which imports `lower.client.ts`: the route renders
 * `UP(LOW_REAL)` when both denied files are real.
 */
const nested = {
  ...files,
  'src/feature.ts': `import { value } from './upper.client'
export const read = () => value()
`,
  'src/upper.client.ts': `import { read } from './bridge'
export const value = () => 'UP(' + String(read()) + ')'
`,
  'src/bridge.ts': `import { value } from './lower.client'
export const read = () => value()
`,
  'src/lower.client.ts': `export const value = () => 'LOW_REAL'\n`,
}

/** The server compiler's rules of each layout of `nested`. */
const nestedLayouts = [
  {
    layout: 'a layer each',
    rules: [
      { test: /upper\.client\.ts$/, layer: 'upper' },
      { test: /lower\.client\.ts$/, layer: 'lower' },
    ],
  },
  {
    layout: 'one layer for both',
    rules: [{ test: /(upper|lower)\.client\.ts$/, layer: 'upper' }],
  },
  { layout: 'no layer', rules: [] },
]

describe('Rsbuild build, a denied target the real module of another brings through an exempt file', () => {
  // (the two layouts whose second layer is known before the settlement: one
  // row each)
  test.each([
    ...(['mock', 'error'] as const).flatMap((behavior) =>
      [false, true].map((rsc) => ({ ...nestedLayouts[0]!, behavior, rsc })),
    ),
    ...nestedLayouts
      .slice(1)
      .map((layout) => ({ ...layout, behavior: 'error' as const, rsc: true })),
  ])(
    '$layout, $behavior, RSC $rsc: both are real, nothing reported',
    async ({ rules, behavior, rsc }) => {
      const built = await build(
        nested,
        rules,
        { behavior, exclude: ['**/feature.ts', '**/bridge.ts'] },
        rsc,
      )
      expect(violationsOf(built)).toEqual([])
      const { url } = await built.preview()
      const html = await (await fetch(new URL('/', url))).text()
      expect(texts(html, 'label')).toEqual(['UP(LOW_REAL)'])
    },
  )
})

/**
 * `feature.ts` (exempt) imports `upper.client.ts` (in the user's layer
 * `upper`), whose real module imports `ghost.ts` (exempt): it reads
 * `lower.client.ts` through `pattern.ts` (checked, a context), and names it
 * in an import the bundler drops (`if (false)`). Only the context reaches
 * the lower file, so it is its mock: the route renders `UP(<mock>)`.
 */
const lateGuess = {
  ...files,
  'src/feature.ts': `import { value } from './upper.client'
export const read = () => value()
`,
  'src/upper.client.ts': `import { read } from './ghost'
export const value = () => 'UP(' + String(read()) + ')'
`,
  'src/ghost.ts': `import { read as viaPattern } from './pattern'
if (false) import('./lower.client')
${describeValuePrelude}
export const read = () => describeValue(viaPattern(), 'LOW_REAL')
`,
  'src/pattern.ts': `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/lower\\.client\\.ts$/,
})
export const read = () => files('./lower.client.ts').value()
`,
  'src/lower.client.ts': `export const value = () => 'LOW_REAL'\n`,
}

// the lower file is first built with the real module (an exempt file names
// it), in the settlement's round that builds the upper file real, and first
// corrected in the next round.
// Source: the RSC phase 1 re-check 4 (/var/tmp/rsc-p1-recheck4/report.md §1,
// `late-guess.py`, `repeat-late.py`: 012645978b failed the build, "could not
// settle", db260cf3a3 failed it with R147)
describe('Rsbuild build, a denied file a round of the settlement brings, which only a checked context reaches', () => {
  test.each([false, true])(
    'RSC %s: the build serves its mock and reports the context import',
    async (rsc) => {
      const built = await build(
        lateGuess,
        [{ test: /upper\.client\.ts$/, layer: 'upper' }],
        { behavior: 'mock', exclude: ['**/feature.ts', '**/ghost.ts'] },
        rsc,
      )
      const { url } = await built.preview()
      const html = await (await fetch(new URL('/', url))).text()
      expect({
        label: texts(html, 'label'),
        violations: violationsOf(built).map(({ importer, specifier }) => ({
          importer: importer.replace(/:.*/, ''),
          specifier,
        })),
      }).toEqual({
        // (`describeValue`: by what the mock does, never by its label)
        label: ['UP(a safe mock)'],
        violations: [
          { importer: 'src/pattern.ts', specifier: 'src/lower.client.ts' },
        ],
      })
    },
  )
})
