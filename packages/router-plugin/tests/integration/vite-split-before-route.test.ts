/**
 * A split route chunk compiled in a process that never compiled its route
 * module (a Vitest run that takes the route from its `fsModuleCache` and
 * transforms only the chunk, #9023): the chunk imports the route's shared
 * binding instead of a copy, so the loader and the split component share one
 * store.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import react from '@vitejs/plugin-react'
import { expect, test } from 'vitest'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { tanstackRouter } from '../../src/vite'
import { head, rootRoute } from '../build-harness'

test('a split component compiled before its route reads the store its loader wrote', async () => {
  const server = await closeAtEnd(() =>
    createDevServer({
      dir: path.dirname(fileURLToPath(import.meta.url)),
      prefix: '.split-before-route-',
      files: {
        'store.ts': `export const stores: Array<unknown> = []
export function createStore(value: number) {
  const store = { get: () => value, set: (next: number) => { value = next } }
  stores.push(store)
  return store
}
`,
        'render.tsx': `import { renderToString } from 'react-dom/server'
export const render = (Component: () => unknown) => renderToString(<Component />)
`,
        'routes/__root.tsx': rootRoute,
        'routes/posts.tsx': `${head}import { createStore } from '../store'
const visits = createStore(0)
export const Route = createFileRoute('/posts')({
  loader: () => {
    visits.set(visits.get() + 1)
  },
  component: () => <p>{visits.get()}</p>,
})
`,
      },
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
        }),
        react(),
      ],
    }),
  )
  const split = await server.import('/routes/posts.tsx?tsr-split=component')
  const { Route } = await server.import('/routes/posts.tsx')
  await Route.options.loader()
  const { render } = await server.import('/render.tsx')
  expect(render(split.component)).toBe('<p>1</p>')
  expect((await server.import('/store.ts')).stores).toHaveLength(1)
}, 60_000)
