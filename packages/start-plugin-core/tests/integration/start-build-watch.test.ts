/**
 * `vite build --watch` and `rsbuild build --watch` of a Start app: the first
 * build succeeds, and an edit of a module both environments bundle rebuilds
 * them with it; the client's server fn is still served by the rebuilt server
 * (Start's own server entry, inside a real request).
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 60_000

const files = {
  'greeting.ts': `export const greeting = 'MARK_BEFORE'
`,
  'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { greeting } from './greeting'
export const greet = createServerFn().handler(async () => greeting)
`,
  'client-entry.ts': `export { greet } from './fns'
export { greeting } from './greeting'
`,
  'ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
}

describe.each(startBundlers)('%s build --watch', (bundler) => {
  test(
    'the first build succeeds and an edit rebuilds both environments',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        watchEdits: {
          'greeting.ts': `export const greeting = 'MARK_AFTER'
`,
        },
      })
      expect((await client.run(`return entry.greeting`)).result).toBe(
        'MARK_AFTER',
      )
      const url = (await client.run(`return entry.greet.url`)).result
      const { result } = await ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_AFTER')
    },
    timeout,
  )
})
