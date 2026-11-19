/**
 * Import protection and `'use client'` components a server component
 * renders, in a Vite production build with RSC (SPEC J6.1, J6.3;
 * rsc-use-client-app.ts). In the `rsc` environment the component is a
 * client reference: neither its restriction to the client nor its own
 * imports are judged there.
 */
import { describe, expect, test } from 'vitest'
import { openRscPage, startRscPreviewServer } from './rsc-app'
import {
  clientFileApp,
  expectCompClicks,
  markedApp,
  npmClientOnlyApp,
  recorder,
  summary,
} from './rsc-use-client-app'

const timeout = 60_000

describe('Vite build with RSC', () => {
  test.each([
    ['client-only-marked', markedApp],
    ['.client', clientFileApp],
  ])(
    'a %s component a server component renders works (mock)',
    async (_, files) => {
      const { violations, start } = recorder('mock')
      const server = await startRscPreviewServer({ start, files })
      await expectCompClicks(await openRscPage(server, '/c'))
      expect(
        summary(violations).filter((line) => line.startsWith('rsc ')),
      ).toEqual([])
    },
    timeout,
  )

  test(
    "a 'use client' component importing React's client-only package builds and works",
    async () => {
      const { start } = recorder('error')
      const server = await startRscPreviewServer({
        start,
        files: npmClientOnlyApp,
      })
      await expectCompClicks(await openRscPage(server, '/c'))
    },
    timeout,
  )
})
