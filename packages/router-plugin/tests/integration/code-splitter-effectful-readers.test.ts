/**
 * Two declarations with side effects, one reading the other when the
 * module loads, that only the split component needs (TanStack Table's
 * `columns = [columnHelper.accessor(…)]`, a zod schema extending another):
 * both load with the component's chunk, in source order, and nothing is
 * reported (R138). An effect after them that the route module keeps (the
 * loader's schema) changes nothing (no order rule). Vite and Rspack SSR
 * builds and an Rsbuild client build, run in Node.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  build,
  buildWithRsbuild,
  head,
  rootRoute,
  ssrRenderEntry,
} from '../build-harness'

const timeout = 180_000

const routes = {
  // only the component reads them
  moves: `const columnHelper = createColumnHelper('moves')
const columns = [columnHelper.accessor('name'), columnHelper.accessor('email')]
export const Route = createFileRoute('/')({
  component: () => <p>{columns.join(',')}</p>,
})
`,
  // the loader's schema, an effect after them, stays; no order rule: the
  // two move all the same
  stays: `const columnHelper = createColumnHelper('stays')
const columns = [columnHelper.accessor('name')]
const Search = createColumnHelper('search')
export const Route = createFileRoute('/')({
  loader: () => Search,
  component: () => <p>{columns.join(',')}</p>,
})
`,
}
const names = Object.keys(routes)
const file = (name: string) => `routes/${name}.tsx`

const files = {
  'routes/__root.tsx': rootRoute,
  // records each call, in order
  'table.ts': `export function createColumnHelper(name: string) {
  ;((globalThis as any).seen ??= []).push(name)
  return {
    accessor(key: string) {
      ;(globalThis as any).seen.push(name + ':' + key)
      return key
    },
  }
}
`,
  ...Object.fromEntries(
    Object.entries(routes).map(([name, code]) => [
      file(name),
      `${head}import { createColumnHelper } from '../table'\n${code}`,
    ]),
  ),
  'entry.ts': `${ssrRenderEntry.replace(/^export \{ Route \}.*$/m, '')}
${names.map((name) => `import { Route as ${name} } from './routes/${name}'`).join('\n')}
export const routes = { ${names.join(', ')} }
`,
}

const builds = {
  vite: () => build({ bundler: 'vite', env: 'ssr', minify: false, files }),
  rspack: () => build({ bundler: 'rspack', env: 'ssr', minify: false, files }),
  // a client build (ES modules), run in Node as the others
  rsbuild: () => buildWithRsbuild({ files, registerCleanup: () => {} }),
}

describe.each(Object.entries(builds))('a %s build', (_name, create) => {
  it(
    'loads two effectful declarations one chunk needs with it, in source order, unless an effect after them stays',
    async () => {
      const app = await create()
      try {
        const { result } = (await app.run(`
          const atLoad = [...(globalThis.seen ?? [])]
          const html = {}
          for (const [name, route] of Object.entries(entry.routes)) {
            html[name] = (await entry.render(route.options.component)).replace(/<[^>]*>/g, '')
          }
          return { atLoad, after: globalThis.seen, html }
        `)) as {
          result: {
            atLoad: Array<string>
            after: Array<string>
            html: Record<string, string>
          }
        }
        expect(result.html).toEqual({ moves: 'name,email', stays: 'name' })
        // the loader's schema ran when the module loaded; the moved ones
        // with their chunk, in order, once
        expect(result.atLoad).toEqual(['search'])
        expect(result.after).toEqual([
          'search',
          'moves',
          'moves:name',
          'moves:email',
          'stays',
          'stays:name',
        ])
        const diagnostics = [...app.warnings, ...app.consoleMessages]
        const reports = (name: string) =>
          findDiagnostics(diagnostics, { file: file(name), root: app.root })
        expect(reports('moves')).toEqual([])
        expect(reports('stays')).toEqual([])
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
