/**
 * The TypeScript declarations whose name isn't a plain identifier statement:
 * `namespace A.B` declares `A`, and `export import R = N.v` declares and exports
 * `R`. A split component reading them gets the binding on every bundler.
 */
import { describe, expect, test } from 'vitest'
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

const shapes: Array<[string, string, string]> = [
  [
    'a dotted namespace only the chunk reads',
    `namespace A.B { export const v = 'MARK_NS_END' }\n`,
    'A.B.v',
  ],
  [
    'a dotted namespace the route module also reads',
    `namespace A.B { export const v = 'MARK_NS_END' }\n;(globalThis as any).kept = A.B.v\n`,
    'A.B.v',
  ],
  [
    'an exported dotted namespace',
    `export namespace A.B { export const v = 'MARK_NS_END' }\n`,
    'A.B.v',
  ],
  [
    'a dotted namespace three levels deep',
    `namespace A.B.C { export const v = 'MARK_NS_END' }\n`,
    'A.B.C.v',
  ],
  [
    'a dotted namespace merged with a plain one',
    `namespace A { export const u = 'MARK_NS' }\nnamespace A.B { export const v = '_END' }\n`,
    'A.u + A.B.v',
  ],
  [
    'an exported import alias',
    `namespace N { export const v = 'MARK_NS_END' }\nexport import R = N.v\n`,
    'R',
  ],
  [
    'an exported import alias the route module also reads',
    `namespace N { export const v = 'MARK_NS_END' }\nexport import R = N.v\n;(globalThis as any).kept = R\n`,
    'R',
  ],
  [
    'an exported dotted namespace that another export names too',
    `export namespace A.B { export const v = 'MARK_NS_END' }\nexport { A as Z }\n`,
    'A.B.v',
  ],
  [
    'an exported type-only import of a module',
    `namespace N { export const v = 'MARK_NS_END' }\nexport import type R = require('../types')\nconst read: R.T = N.v\n`,
    'read',
  ],
  [
    'an import alias',
    `namespace N { export const v = 'MARK_NS_END' }\nimport R = N.v\n`,
    'R',
  ],
]

describe.each(['vite', 'rspack', 'webpack'] as const)('on %s', (bundler) => {
  test.each(shapes)(
    '%s renders',
    async (_, source, read) => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: {
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': `${head}${source}${component(read)}`,
          'types.ts': `export type T = string\n`,
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
})

// Neither name of `A` goes missing when one of them is extracted.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'an exported dotted namespace another export names keeps both names on %s',
  async (bundler) => {
    const app = await build({
      bundler,
      env: 'client',
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}export namespace A.B { export const v = 'MARK_NS_END' }
export { A as Z }
${component('A.B.v')}`,
        'entry.ts': `import * as M from './routes/index'
export const read = () => [(M as any).A.B.v, (M as any).Z.B.v]
`,
      },
    })
    try {
      const { result } = await app.run('return entry.read()')
      expect(result).toEqual(['MARK_NS_END', 'MARK_NS_END'])
    } finally {
      await app.dispose()
    }
  },
  timeout,
)

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
