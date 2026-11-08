import { describe, expect, test } from 'vitest'
import { build, head, rootRoute } from '../build-harness'

const timeout = 120_000

// An export name is any string, and it names the module's id: nothing in it may
// read as a language, a directory or a loader to the bundler.
describe.each(['vite', 'rspack', 'webpack'] as const)(
  'a string export name of an extracted module on %s',
  (bundler) => {
    test.each([
      // (webpack reads `export { K as "" } from` as `export *`: KNOWN-BUGS,
      // "Upstream issues")
      ...(bundler === 'webpack' ? [] : ['']),
      'a.b',
      'a.css',
      'a.json',
      'a/b',
      '../../x',
      'a!b',
      'a\\b',
      'a\nb',
    ])(
      '%j builds and runs',
      async (name) => {
        const literal = JSON.stringify(name)
        const app = await build({
          bundler,
          env: 'client',
          minify: false,
          files: {
            'routes/__root.tsx': rootRoute,
            'dep.ts': `export const dep = '_END'\n`,
            'routes/index.tsx': `${head}import { dep } from '../dep'
class K { static m = 'MARK_STRING' + dep }
export { K as ${literal} }
export const Route = createFileRoute('/')({ component: () => <p>{new K() instanceof K ? K.m : ''}</p> })
`,
            'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import * as M from './routes/index'
export const value = () => (M as any)[${literal}].m
export const render = async () => {
  const component = M.Route.options.component as any
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
          },
        })
        try {
          const { result } = await app.run(
            'return [entry.value(), await entry.render()]',
          )
          expect(result).toEqual(['MARK_STRING_END', '<p>MARK_STRING_END</p>'])
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )
  },
)
