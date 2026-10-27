/**
 * A split option's importer (`() => import('./route?tsr-split=…')`) costs no
 * binding of its own in a minified client bundle: the minifier inlines it
 * into the `lazyRouteComponent` / `lazyFn` call, also when the route module
 * keeps an effectful declaration (read by an option that stays and by the
 * split component) before `Route`.
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
  component: () => <p>MARK_SPLIT {pages.length}</p>,
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
