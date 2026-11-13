/**
 * A TypeScript declaration whose name isn't a plain identifier:
 * `namespace A.B` declares `A`. A split component reading a value typed
 * with it renders.
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
  'a split component reading a value typed with a namespace of types only renders',
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
