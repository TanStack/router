import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

describe('speed', () => {
  let id = 0
  const { router, component } = createTestRouter()
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function setup() {
    id = 0
    let resolve: () => void = () => {}
    unsub = router.subscribe('onRendered', () => resolve())

    const navigate = (opts: NavigateOptions) =>
      new Promise<void>((resolveNext) => {
        resolve = resolveNext
        router.navigate(opts)
      })

    next = () => {
      const nextId = id++

      return navigate({
        to: '/$id',
        params: { id: nextId },
        search: { id: nextId },
        replace: true,
      })
    }

    render(component)
    await act(() => router.load())
  }

  function teardown() {
    cleanup()
    unsub()
  }

  /**
   * Running `vitest bench` ignores "suite hooks" like `beforeAll` and `afterAll`,
   * so we use tinybench's `setup` and `teardown` options to run our setup and teardown logic.
   *
   * But CodSpeed calls the benchmarked function directly, bypassing `setup` and `teardown`,
   * but it does support `beforeAll` and `afterAll`.
   *
   * So it looks like we're setting up in duplicate, but in reality, it's only running once per environment, as intended.
   */

  beforeAll(setup)
  afterAll(teardown)

  bench('navigate', () => act(next), {
    warmupIterations: 1000,
    time: 10_000,
    setup,
    teardown,
  })
})
