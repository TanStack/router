/**
 * A split option's importer (`() => import('/…/route.tsx?tsr-split=…')`) costs no
 * binding of its own in a minified client bundle: the minifier inlines it
 * into the `lazyRouteComponent` / `lazyFn` call, also when the route module
 * keeps an effectful declaration (read by an option that stays) before
 * `Route`, and nothing stands between a declaration and the route options
 * spreading it.
 */
import { expect, test } from 'vitest'
import { build, head, routeApp } from '../build-harness'

test('the minifier inlines the split importer past an effectful declaration the route module keeps (vite)', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    files: routeApp(
      `${head}import { query } from '../api'
const pages = [query('MARK_FIRST'), query('second')]
export const Route = createFileRoute('/')({
  loader: () => pages.map((page) => page.key),
  component: () => <p>MARK_SPLIT</p>,
})
`,
      {
        env: 'client',
        files: {
          'api.ts': `export function query(key: string) {
  ;(globalThis as any).calls = [...((globalThis as any).calls ?? []), key]
  return { key }
}
`,
        },
      },
    ),
  })
  const routeChunks = app.chunks.filter((c) => c.code.includes('MARK_FIRST'))
  expect(routeChunks).toHaveLength(1)
  const [routeChunk] = routeChunks
  expect(app.where('MARK_SPLIT')).toBe('lazy')
  expect(routeChunk!.dynamicImports).toHaveLength(1)
  // no binding holds the importer (`i = () => import(…)`, with or without
  // Vite's preload wrapper): the call takes it as its argument
  expect(routeChunk!.code).not.toMatch(
    /[\w$]+=\(\)=>(?:[\w$]+\(\(\)=>)?import\(/,
  )
  const run = await app.run(
    'return { calls: globalThis.calls, loaded: await entry.Route.options.loader() }',
  )
  expect(run.result).toEqual({
    calls: ['MARK_FIRST', 'second'],
    loaded: ['MARK_FIRST', 'second'],
  })
}, 60_000)

// Source: coverage review A, finding 3 (+17 B eager against main on Vite 8:
// the importer's `const` between `base` and the route statement kept
// Rolldown from inlining either)
test('the minifier inlines the split importer and a declaration the route options spread (vite)', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    files: routeApp(
      `${head}function Page() { return <p>MARK_SPLIT</p> }
const base = { staleTime: 5000, gcTime: 1000, pendingMs: 'MARK_BASE' }
export const Route = createFileRoute('/')({ ...base, component: Page })
`,
      { env: 'client' },
    ),
  })
  const routeChunks = app.chunks.filter((c) => c.code.includes('MARK_BASE'))
  expect(routeChunks).toHaveLength(1)
  const [routeChunk] = routeChunks
  expect(app.where('MARK_SPLIT')).toBe('lazy')
  expect(routeChunk!.dynamicImports).toHaveLength(1)
  // no binding holds the importer, none the spread object: both are
  // written into the route options
  expect(routeChunk!.code).not.toMatch(
    /[\w$]+=\(\)=>(?:[\w$]+\(\(\)=>)?import\(/,
  )
  expect(routeChunk!.code).not.toMatch(/[\w$]+=\{staleTime:/)
  const run = await app.run(
    'const o = entry.Route.options; return { staleTime: o.staleTime, gcTime: o.gcTime, pendingMs: o.pendingMs, component: typeof o.component }',
  )
  expect(run.result).toEqual({
    staleTime: 5000,
    gcTime: 1000,
    pendingMs: 'MARK_BASE',
    component: 'function',
  })
}, 60_000)

// Two options of one group share their chunk's importer: one dynamic import
// in the route chunk (main writes one per option)
test('two split options of one group load their chunk through one importer (vite)', async () => {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    files: routeApp(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader', 'component']],
  loader: () => 'MARK_LOADER',
  component: () => <p>MARK_SPLIT</p>,
  staticData: { tag: 'MARK_ROUTE' },
})
`,
      { env: 'client' },
    ),
  })
  const routeChunks = app.chunks.filter((c) => c.code.includes('MARK_ROUTE'))
  expect(routeChunks).toHaveLength(1)
  const [routeChunk] = routeChunks
  expect(app.where('MARK_LOADER')).toBe('lazy')
  expect(app.where('MARK_SPLIT')).toBe('lazy')
  expect(routeChunk!.code.match(/\bimport\(/g)).toHaveLength(1)
  const run = await app.run(
    'return { loaded: await entry.Route.options.loader(), component: typeof entry.Route.options.component }',
  )
  expect(run.result).toEqual({ loaded: 'MARK_LOADER', component: 'function' })
}, 60_000)
