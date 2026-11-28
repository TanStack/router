/**
 * A split route chunk compiled in a process that never compiled its route
 * module (#9023): Vitest's second run takes the route from its
 * `fsModuleCache` and transforms only the chunk the route's lazy component
 * loads. The chunk imports the route's shared binding instead of a copy, so
 * the loader and the split component share one store.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'
import { expect, test } from 'vitest'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { head, rootRoute } from '../build-harness'

const here = path.dirname(fileURLToPath(import.meta.url))

test('a split component compiled in a later Vitest run than its route reads the store its loader wrote', async () => {
  const app = await closeAtEnd(
    () =>
      createApp({
        dir: here,
        prefix: '.split-before-route-',
        files: {
          'vitest.config.ts': `import { defineConfig } from 'vitest/config'
import { tanstackRouter } from ${JSON.stringify(path.join(here, '../../src/vite.ts'))}
export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true })],
  test: { fsModuleCachePath: '.fs-cache', include: [process.env.RUN_FILE] },
})
`,
          'src/store.ts': `export const stores: Array<unknown> = []
export function createStore(value: number) {
  const store = { get: () => value, set: (next: number) => { value = next } }
  stores.push(store)
  return store
}
`,
          'src/routes/__root.tsx': rootRoute,
          'src/routes/posts.tsx': `${head}import { createStore } from '../store'
const visits = createStore(0)
export const Route = createFileRoute('/posts')({
  loader: () => {
    visits.set(visits.get() + 1)
  },
  component: () => <p>{visits.get()}</p>,
})
`,
          'first.test.ts': `import { test } from 'vitest'
test('imports the route', async () => {
  await import('./src/routes/posts')
})
`,
          'second.test.tsx': `import { writeFile } from 'node:fs/promises'
import { test } from 'vitest'
import { renderToString } from 'react-dom/server'
import { stores } from './src/store'
test('renders the split component', async () => {
  const { Route } = await import('./src/routes/posts')
  await Route.options.loader()
  const Component = Route.options.component
  await Component.preload()
  await writeFile('result.json', JSON.stringify({ html: renderToString(<Component />), stores: stores.length }))
})
`,
        },
      }),
    (opened) => opened.dispose(),
  )
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')),
  )
  for (const file of ['first.test.ts', 'second.test.tsx']) {
    await runNodeProgram(
      `import { startVitest } from 'vitest/node'
const vitest = await startVitest('test', [], { watch: false })
await vitest.close()
if (process.exitCode) throw new Error('${file} failed')`,
      { cwd: app.root, env: { ...env, RUN_FILE: file }, timeout: 60_000 },
    )
  }
  expect(
    JSON.parse(await readFile(path.join(app.root, 'result.json'), 'utf8')),
  ).toEqual({ html: '<p>1</p>', stores: 1 })
})
