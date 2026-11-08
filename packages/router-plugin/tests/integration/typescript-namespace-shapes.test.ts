/**
 * The TypeScript declarations whose name isn't a plain identifier statement:
 * `namespace A.B` declares `A`, and `export import R = N.v` declares and exports
 * `R`. A split component reading them gets the binding on every bundler.
 */
import { expect, test } from 'vitest'
import { build, head, rootRoute } from '../build-harness'

const timeout = 60_000

const entry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export { Route } from './routes/index'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

const component = (read: string) =>
  `export const Route = createFileRoute('/')({ component: () => <p>{${read}}</p> })\n`

test(
  'a namespace of types only stays out of every chunk',
  async () => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}namespace T.U { export type X = 'MARK_NS_END' }
const value: T.U.X = 'MARK_NS_END'
${component('value')}`,
        'entry.ts': entry,
      },
    })
    try {
      const { result } = await app.run(
        'return entry.render(entry.Route.options.component)',
      )
      expect(result).toBe('<p>MARK_NS_END</p>')
    } finally {
      await app.dispose()
    }
  },
  timeout,
)
