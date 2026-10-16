/**
 * The Start compiler on a running Vite dev server (client and SSR
 * environments, SSR as the server fn provider): edits of server fn factories
 * and handlers reach every environment without a restart.
 */
import { describe, expect, test } from 'vitest'
import { startDevServer } from './dev-server'

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`

describe('Vite dev: editing a server fn factory', () => {
  // Mirrors rsbuild/dev-server.test.ts "every module importing a factory
  // from ./b that stops being one keeps its handler" (N17).
  test(
    'client: a module importing a factory that stops being one keeps its handler',
    async () => {
      const server = await startDevServer({
        files: {
          'src/b.ts': factory,
          'src/db.server.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
          'src/a.tsx': `import { base } from './b'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
        },
      })
      expect(await server.transform('/src/a.tsx')).not.toContain('db.x()')

      await server.edit({ 'src/b.ts': plain })

      expect(await server.transform('/src/a.tsx')).toContain('db.x()')
    },
    timeout,
  )
})

describe('Vite dev: editing a server fn handler', () => {
  // Source: replaces server-fn-resolver-module.test.ts "imports on every call
  // by default" and "keeps the imported module when memoizeModules is set",
  // and the HMR half of exports-and-directives.test.ts "dev providers export
  // the handler and accept HMR updates" (N16; gap DV24).
  test(
    'SSR: the server fn resolver runs the edited handler under the same id, without a restart',
    async () => {
      const server = await startDevServer({
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'before')
`,
        },
      })
      /** Calls `greet` the way the server-fn router does: by id. */
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        const { getServerFnById } = await server.import(
          '#tanstack-start-server-fn-resolver',
        )
        const handler = await getServerFnById(greet.functionId, {
          origin: 'client',
        })
        return { id: greet.functionId, result: await handler({}) }
      }
      const before = await call()
      expect(before.result).toBe('before')

      await server.edit({
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'after')
`,
      })

      expect(await call()).toEqual({ id: before.id, result: 'after' })
    },
    timeout,
  )
})
