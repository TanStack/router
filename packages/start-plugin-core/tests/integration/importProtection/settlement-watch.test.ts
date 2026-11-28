/**
 * A watch mode build serves what a cold build of the same source serves
 * after an edit takes an exempt importer out of the build and another puts
 * it back: the returning importer's import of the denied file is real again
 * (SPEC J6.7), whatever its plan cache kept.
 * - `vite build --watch`: the server entry reads a denied file through an
 *   exempt file, then a plain file, then the exempt file again.
 * - `rsbuild build --watch` (RSC): a chain of server fns, each calling the
 *   next through an exempt file that re-exports a denied file of a layer of
 *   the user's; the chain's middle function becomes a plain function, then
 *   comes back.
 * - `rsbuild build --watch`: a denied file in a cycle with a checked barrel
 *   whose import of it `allowImport` allows; the route switches from the
 *   barrel to a pattern import of the denied file.
 * Source: the RSC phase 1 re-check 3 (/var/tmp/rsc-p1-recheck3/report.md
 * "Resolver removal, watch and other limits", `closure.py edits`,
 * `layercontrols.py`: `L0 L1 [import-protection mock]` restored on
 * db260cf3a3 and 2169b4165c), design-rsc-phase1-settlement.md fact 8
 * (`vitewatch.py`: the mock, reported, on both), S5, S5v; re-check 4
 * (/var/tmp/rsc-p1-recheck4/report.md §2, `grounded.py cyclewatch`).
 */
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { buildStart } from '../../build-start'
import { violationsOf } from '../../importProtection/start-apps'
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

/** The texts of the elements of `html` with `data-testid` `id`. */
const texts = (html: string, id: string) =>
  [...html.matchAll(new RegExp(`data-testid="${id}">([^<]*)<`, 'g'))].map(
    (m) => m[1],
  )

describe('vite build --watch, an exempt importer that leaves the build and comes back', () => {
  test('its import of the denied file is real again, nothing reported', async () => {
    const entry = (from: string) => `export { read } from './${from}'\n`
    const built = await buildStart({
      bundler: 'vite',
      files: {
        ...root,
        'src/entry.ts': entry('feature'),
        'src/feature.ts': `import { denied } from './private.client'
export const read = () => denied()
`,
        'src/plain.ts': `export const read = () => 'PLAIN'\n`,
        'src/private.client.ts': `export const denied = () => 'EXPECTED_ROUTE_LABEL'\n`,
      },
      entry: 'src/entry.ts',
      start: {
        importProtection: { behavior: 'mock', exclude: ['**/feature.ts'] },
      } as never,
      watchEdits: [
        { edits: { 'src/entry.ts': entry('plain') } },
        { edits: { 'src/entry.ts': entry('feature') } },
      ],
    })
    expect({
      read: (await built.ssr.run(`return entry.read()`)).result,
      violations: violationsOf(built),
    }).toEqual({ read: 'EXPECTED_ROUTE_LABEL', violations: [] })
  })
})

/**
 * `fn<i>.ts`'s handler returns `L<i> ` and what `next` of `grant<i+1>.ts`
 * (exempt) returns: `denied` of `private<i+1>.client.ts` (in the user's
 * layer `reports`), which calls `fn<i+1>`; the last returns `DEEP_VALUE`.
 * The route calls `fn0` through `feature.ts` (exempt) and
 * `private0.client.ts`.
 */
function cascade(n: number): Record<string, string> {
  const out: Record<string, string> = {
    ...root,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../feature'
const label = createIsomorphicFn()
  .server(() => read())
  .client(() => 'client control')
export const Route = createFileRoute('/')({
  loader: async () => ({ value: String(await label()) }),
  component: Home,
})
function Home() {
  return <main data-testid="label">{Route.useLoaderData().value}</main>
}
`,
    'src/feature.ts': `export { denied as read } from './private0.client'\n`,
  }
  for (let i = 0; i < n; i++) {
    out[`src/private${i}.client.ts`] = `import { fn${i} } from './fn${i}'
export const denied = () => fn${i}()
`
    out[`src/grant${i}.ts`] =
      `export { denied as next } from './private${i}.client'\n`
    out[`src/fn${i}.ts`] =
      `${i < n - 1 ? `import { next } from './grant${i + 1}'\n` : ''}import { createServerFn } from '@tanstack/react-start'
export const fn${i} = createServerFn().handler(${i < n - 1 ? `async () => 'L${i} ' + (await next())` : `() => 'DEEP_VALUE'`})
`
  }
  return out
}

describe('rsbuild build --watch with RSC, a server fn whose module leaves the build and comes back', () => {
  test('the restored chain renders its last value through the denied files of the layer', async () => {
    const files = cascade(3)
    const built = await buildStart({
      bundler: 'rsbuild',
      files,
      entry: 'src/entry.ts',
      symlinks: rsbuildRscLinks(),
      rsbuildConfig: {
        environments: {
          ssr: {
            tools: {
              rspack: {
                module: {
                  rules: [
                    { test: /private\d+\.client\.ts$/, layer: 'reports' },
                  ],
                },
              },
            },
          },
        },
      },
      start: {
        rsc: { enabled: true },
        importProtection: {
          behavior: 'error',
          exclude: ['**/feature.ts', '**/grant*.ts'],
        },
      } as never,
      watchEdits: [
        {
          edits: {
            'src/fn1.ts': `export const fn1 = () => 'REMOVED_FN_1'\n`,
          },
        },
        { edits: { 'src/fn1.ts': files['src/fn1.ts']! } },
      ],
    })
    const { url } = await built.preview()
    const response = await fetch(new URL('/', url))
    expect({
      status: response.status,
      label: texts(await response.text(), 'label'),
      violations: violationsOf(built),
    }).toEqual({ status: 200, label: ['L0 L1 DEEP_VALUE'], violations: [] })
  })
})

describe('rsbuild build --watch, a denied file in a cycle with a barrel whose import of it allowImport allows', () => {
  // (re-check 4 §2: 012645978b and db260cf3a3 failed the rebuild with R147
  // and kept the real module)
  test('once only a pattern import reaches it, the rebuild serves its mock, as a fresh build of the source', async () => {
    const route = (
      from: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../${from}'
${describeValuePrelude}
const label = createIsomorphicFn()
  .server(() => describeValue(read(), 'A_REAL'))
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main data-testid="label">{label()}</main>
}
`
    const start = {
      importProtection: {
        behavior: 'mock',
        allowImport: (info: { importer: string; specifier: string }) =>
          info.importer.endsWith('/kit/index.ts') &&
          info.specifier === './a.client',
      },
    }
    const built = await buildStart({
      bundler: 'rsbuild',
      files: {
        ...root,
        'src/kit/index.ts': `export { value } from './a.client'
export const helper = () => 'H'
`,
        'src/kit/a.client.ts': `import { helper } from './index'
export const value = () => 'A_REAL ' + helper()
`,
        'src/feature.ts': `import { value } from './kit/index'
export const read = () => value()
`,
        'src/topPattern.ts': `const files = import.meta.webpackContext('./kit', {
  recursive: false,
  regExp: /^\\.\\/a\\.client\\.ts$/,
})
export const read = () => files('./a.client.ts').value()
`,
        'src/routes/index.tsx': route('feature'),
      },
      entry: 'src/entry.ts',
      start: start as never,
      watchEdits: { 'src/routes/index.tsx': route('topPattern') },
    })
    // (each distinct report: a watch edit may take more than one
    // compilation, and each reports what it serves as a mock)
    const served = async (b: typeof built) => {
      const { url } = await b.preview()
      return {
        label: texts(await (await fetch(new URL('/', url))).text(), 'label'),
        violations: [
          ...new Set(
            violationsOf(b).map(({ importer, specifier }) =>
              JSON.stringify({
                importer: importer.replace(/:.*/, ''),
                specifier,
              }),
            ),
          ),
        ].map((v) => JSON.parse(v)),
      }
    }
    const watched = await served(built)
    expect(watched).toEqual({
      // (`describeValue`: by what the mock does, never by its label)
      label: ['a safe mock'],
      violations: [
        { importer: 'src/topPattern.ts', specifier: 'src/kit/a.client.ts' },
      ],
    })
    expect(await served(await built.rebuild())).toEqual(watched)
  })
})
