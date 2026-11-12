/**
 * Split modules are imported through specifiers holding the route file's
 * absolute path (`…/routes/<file>.tsx?tsr-split=…`), with the default
 * groupings and with `codeSplitGroupings`.
 */
import { expect, test } from 'vitest'
import { build, rootRoute } from '../build-harness'

const timeout = 120_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

const files = {
  'routes/__root.tsx': rootRoute,
  // the default groupings; the component and the error component share
  // module state (one module for both), and the component reads the route
  'routes/posts.tsx': `${head}const store = { hits: 0 }
export const Route = createFileRoute('/posts')({
  loader: () => ({ n: 1 }),
  component: () => {
    store.hits++
    return <div>posts {store.hits} {Route.useLoaderData().n}</div>
  },
  errorComponent: () => <div>error {store.hits}</div>,
  notFoundComponent: () => <div>not found</div>,
})
`,
  'routes/grouped.tsx': `${head}export const Route = createFileRoute('/grouped')({
  codeSplitGroupings: [['loader', 'component'], ['errorComponent', 'pendingComponent']],
  loader: () => ({ n: 2 }),
  component: () => <div>grouped</div>,
  errorComponent: () => <div>grouped error</div>,
  pendingComponent: () => <div>grouped pending</div>,
})
`,
  // an exported component the split component reads and another module imports
  'routes/exported.tsx': `${head}export function Card() {
  return <b>card</b>
}
export const Route = createFileRoute('/exported')({ component: Card })
`,
  'routes/index.tsx': `${head}import { Card } from './exported'
export const Route = createFileRoute('/')({ component: () => <Card /> })
`,
  'entry.ts': `export { Route as root } from './routes/__root'
export { Route as posts } from './routes/posts'
export { Route as grouped } from './routes/grouped'
export { Route as exported } from './routes/exported'
export { Route as index } from './routes/index'
`,
}

// The absolute specifiers are module requests only: a minified production
// client build names no path of the checkout.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'a production client build holds no path of the checkout (%s)',
  async (bundler) => {
    const app = await build({ bundler, env: 'client', files })
    try {
      const withRoot = app.chunks
        .filter(
          (chunk) =>
            chunk.code.includes(app.root) ||
            chunk.code.includes(app.root.replace(/\\/g, '/')),
        )
        .map((chunk) => chunk.fileName)
      expect(withRoot).toEqual([])
      expect(app.where(/grouped error/)).toBe('lazy')
    } finally {
      await app.dispose()
    }
  },
  timeout,
)
