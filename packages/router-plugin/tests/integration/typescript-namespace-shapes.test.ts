/**
 * The TypeScript declarations whose name isn't a plain identifier statement:
 * `namespace A.B` declares `A`, and `export import R = N.v` declares and exports
 * `R`. A split component reading them gets the binding on every bundler. One
 * shape is pinned below: Yuku lists no export for `export namespace A.B`.
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

// An importer of the route file reads the name: with no other export naming `A`,
// it stays in the route module as written.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'an exported dotted namespace is read through the route file on %s',
  async (bundler) => {
    const app = await build({
      bundler,
      env: 'client',
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}export namespace A.B { export const v = 'MARK_NS_END' }
${component('A.B.v')}`,
        'entry.ts': `import * as M from './routes/index'
export const read = () => (M as any).A.B.v
`,
      },
    })
    try {
      const { result } = await app.run('return entry.read()')
      expect(result).toBe('MARK_NS_END')
    } finally {
      await app.dispose()
    }
  },
  timeout,
)

// Bug: Yuku 0.26 (yuku-toolchain/yuku) has no `file.exports` record for
// `export namespace A.B` (one for `export namespace A`), so the compiler doesn't
// know that export names the binding. Another export of it (`export { A as Z }`,
// `export default A`) offers the binding for extraction when only split code
// reads it, and the route file re-exports only the names it knows
// (yuku-toolchain/yuku#318).
// Impact: in a build the route file loses `A`: importers of it fail to link on
// Rolldown, Rspack and Rsbuild, and read undefined on webpack and through a
// namespace import on Rolldown.
describe.each([
  ['export { A as Z }', 'Z'],
  ['export default A', 'default'],
])('an exported dotted namespace and %s', (other, name) => {
  test.fails.each(['vite', 'rspack', 'webpack'] as const)(
    'keeps both names on %s',
    async (bundler) => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: {
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': `${head}export namespace A.B { export const v = 'MARK_NS_END' }
${other}
${component('A.B.v')}`,
          'entry.ts': `import * as M from './routes/index'
export const read = () => [(M as any).A.B.v, (M as any).${name}.B.v]
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
})

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
