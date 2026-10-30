/**
 * Server fns of builders derived from one imported builder, in a real
 * production build of each bundler (build-harness.ts): Start's cross-module
 * prefetch must recognise every derived builder, also when two of a
 * module's imports lead to the same builder at once (review 1, claim #1).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'src/base.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
  'src/builders.ts': `import { base } from './base'
export const authedGet = base.middleware([])
export const authedPost = base.middleware([])
`,
  'src/fns.ts': `import { authedGet, authedPost } from './builders'
export const getFn = authedGet.handler(async () => 'MARK_GET_HANDLER')
export const postFn = authedPost.handler(async () => 'MARK_POST_HANDLER')
`,
  'src/entry.ts': `export { getFn, postFn } from './fns'
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  let dispose: (() => Promise<void>) | undefined
  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      registerCleanup: (cleanup) => {
        dispose = cleanup
      },
    })
  }, timeout)
  afterAll(() => dispose?.())

  // .fails: the second builder's lookup of `base` meets the first one's in flight and reads it as a cycle (UNKNOWN).
  test.fails(
    'two builders derived from one imported builder: neither handler reaches the client',
    () => {
      expect({
        get: build.client.where('MARK_GET_HANDLER'),
        post: build.client.where('MARK_POST_HANDLER'),
      }).toEqual({ get: 'nowhere', post: 'nowhere' })
    },
  )
})
