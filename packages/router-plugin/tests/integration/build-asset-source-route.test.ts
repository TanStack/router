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
// @ts-expect-error (a text module)
export { default as text } from './routes/index.tsx?source'
`,
}

/** The app's rule: `?source` imports are their text (`asset/source`). */
const assetSourceRule = {
  apply(compiler: {
    options: { module: { rules: Array<Record<string, unknown>> } }
  }) {
    compiler.options.module.rules.push({
      resourceQuery: /^\?source$/,
      type: 'asset/source',
    })
  },
}

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    "a route file imported as its text (asset/source) is not the router's output",
    async () => {
      const { tanstackRouter } = await import(`../../src/${bundler}`)
      const app = await build({
        bundler,
        env: 'client',
        files,
        routerPlugins: (config) => [tanstackRouter(config), assetSourceRule],
      })
      const { result } = await app.run('return entry.text')
      // (the app's own TypeScript and JSX rule still reads the file: the
      // text is not compared byte for byte, but nothing of the split is in
      // it and its options stay where the file has them)
      const text = String(result)
      expect(text).not.toContain('lazyRouteComponent')
      expect(text).not.toContain('tsr-split')
      expect(text).toMatch(/import \{ payload \} from ["']\.\.\/payload["']/)
      expect(text).toMatch(/loader: \(\) ?=> ?payload/)
    },
    timeout,
  )
})
