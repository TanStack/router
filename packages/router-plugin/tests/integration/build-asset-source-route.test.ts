/**
 * A route file imported as its text (webpack's and Rspack's `asset/source`,
 * a `?source` import of a source viewer): the router plugin leaves the module
 * as it is, its text and not the plugin's output (a split route module). The
 * loader attaches by file extension, so the host tells the compiler the
 * module's resolved type.
 * Source: whole-PR review R1-20 (Astra, `hosts.mjs asset`).
 */
import { describe, expect, test } from 'vitest'
import { build, head, rootRoute } from '../build-harness'
import { timeout } from '../production-bundle'

const index = `${head}import { payload } from '../payload'
function Page() {
  return <p>{payload}</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  loader: () => payload,
})
`

const files = {
  'routes/__root.tsx': rootRoute,
  'routes/index.tsx': index,
  'payload.ts': `export const payload = 'MARK_PAYLOAD'\n`,
  'entry.ts': `export { routeTree } from './routeTree.gen'
export { Route } from './routes/index'
// @ts-expect-error (a text module)
export { default as text } from './routes/index.tsx?source'
`,
}

/**
 * The app's rule: `?source` imports are their text (`asset/source`), which
 * the app's own TypeScript and JSX rules leave alone (applied before the
 * router plugin, so its rule is not among them).
 */
const assetSourceRule = {
  apply(compiler: {
    options: { module: { rules: Array<Record<string, unknown>> } }
  }) {
    const source = /^\?source$/
    for (const rule of compiler.options.module.rules) {
      rule.resourceQuery = { not: [source] }
    }
    compiler.options.module.rules.push({
      resourceQuery: source,
      type: 'asset/source',
    })
  },
}

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    "a route file imported as its text (asset/source) is the file's text, and the route still splits",
    async () => {
      const { tanstackRouter } = await import(`../../src/${bundler}`)
      const app = await build({
        bundler,
        env: 'client',
        files,
        routerPlugins: (config) => [assetSourceRule, tanstackRouter(config)],
      })
      const { result } = await app.run(
        `const { component, loader } = entry.Route.options
const split = typeof component.preload
await component.preload?.()
return [entry.text, split, loader()]`,
      )
      // the text is the file's, and the route module beside it still splits
      // (its component is lazy; a resolved client component drops `preload`)
      expect(result).toEqual([index, 'function', 'MARK_PAYLOAD'])
    },
    timeout,
  )
})
