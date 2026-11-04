/**
 * Names user code chooses (a specifier, an export, a member) that are also
 * members of Object.prototype, through Start's whole compiler in real builds.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../build-harness'

const timeout = 60_000

const handler = `base.handler(async () => 'MARK_HANDLER')`

describe.each(['constructor', '__proto__', 'toString'])('%s', (name) => {
  test(
    'an import from a package of that name builds, in every import form',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        entry: 'src/entry.ts',
        files: {
          [`node_modules/${name}/package.json`]: JSON.stringify({
            name,
            type: 'module',
            exports: './index.js',
          }),
          [`node_modules/${name}/index.js`]: `export const x = 'MARK_X'
export default x
`,
          'src/entry.ts': `import { x } from '${name}'
import d from '${name}'
import * as n from '${name}'
export { x as y } from '${name}'
export const all = [x, d, n.x]
`,
        },
      })
      expect(build.client.where('MARK_X')).toBe('eager')
    },
    timeout,
  )

  test(
    'an export of that name keeps what it is: a builder read through it is recognised',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        entry: 'src/entry.ts',
        files: {
          'src/lib.ts': `import { createServerFn } from '@tanstack/react-start'
const b = createServerFn()
export { b as "${name}" }
`,
          'src/entry.ts': `import { "${name}" as base } from './lib'
export const fn = ${handler}
`,
        },
      })
      expect(build.client.where('MARK_HANDLER')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'importing a name a module does not export finds nothing: the handler stays',
    async () => {
      const build = await buildStart({
        bundler: 'vite',
        entry: 'src/entry.ts',
        files: {
          'src/lib.ts': `export const base = { handler: (f: unknown) => f }
export { base as "${name}" }
`,
          'src/entry.ts': `import { "${name}" as base } from './lib'
export const fn = ${handler}
`,
        },
      })
      expect(build.client.where('MARK_HANDLER')).toBe('eager')
    },
    timeout,
  )
})

// `S.toString` of a namespace of Start is no factory of it
test(
  'a member of a Start namespace named like an Object.prototype member is left alone',
  async () => {
    const build = await buildStart({
      bundler: 'vite',
      entry: 'src/entry.ts',
      files: {
        'src/entry.ts': `import * as S from '@tanstack/react-start'
export const t = () => 'MARK_MEMBER' + String(S.constructor) + String(S.toString)
export const fn = S.createServerFn().handler(async () => 'MARK_HANDLER')
`,
      },
    })
    expect({
      member: build.client.where('MARK_MEMBER'),
      handler: build.client.where('MARK_HANDLER'),
    }).toEqual({ member: 'eager', handler: 'nowhere' })
  },
  timeout,
)
