/**
 * Control tests of the Start build harness (build-harness.ts): server
 * function handlers stay out of the client build, run on the server, and
 * isomorphic functions keep their environment's branch.
 */
import { expect, test } from 'vitest'
import { buildStart } from './build-harness'

const timeout = 60_000

test(
  'a server function handler is only in the SSR build, loaded on demand, and runs there',
  async () => {
    const { client, ssr } = await buildStart({
      files: {
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_HANDLER')
`,
        'entry.ts': `export { greet } from './fns'
`,
      },
    })
    expect({
      client: client.where('MARK_HANDLER'),
      ssr: ssr.where('MARK_HANDLER'),
    }).toEqual({ client: 'nowhere', ssr: 'lazy' })
    expect((await ssr.run(`return await entry.greet()`)).result).toBe(
      'MARK_HANDLER',
    )
    expect(
      (
        await client.run(`try {
  entry.greet()
} catch (error) {
  return error.message.startsWith('client RPC ')
}`)
      ).result,
    ).toBe(true)
  },
  timeout,
)

test(
  'an isomorphic function keeps the branch of each build',
  async () => {
    const { client, ssr } = await buildStart({
      files: {
        'entry.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const where = createIsomorphicFn()
  .server(() => 'MARK_SERVER')
  .client(() => 'MARK_CLIENT')
`,
      },
    })
    expect({
      client: [client.where('MARK_CLIENT'), client.where('MARK_SERVER')],
      ssr: [ssr.where('MARK_CLIENT'), ssr.where('MARK_SERVER')],
    }).toEqual({ client: ['eager', 'nowhere'], ssr: ['nowhere', 'eager'] })
    expect([
      (await client.run(`return entry.where()`)).result,
      (await ssr.run(`return entry.where()`)).result,
    ]).toEqual(['MARK_CLIENT', 'MARK_SERVER'])
  },
  timeout,
)
