import { cleanup, render } from '@testing-library/vue'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

describe('client-nav', () => {
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

      // update param every 2 navigations,
      // update search every other navigation,
      // this way we can test the impact of both params and search updates,
      // and still observe improvements on granular re-rendering
      return navigate({
        to: '/$id',
        params: { id: Math.floor((nextId + 1) / 2) },
        search: { id: Math.floor(nextId / 2) },
        replace: true,
      })
    }

    render(component)
    await router.load()
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

  bench(
    'client-side navigation loop (vue)',
    async () => {
      for (let i = 0; i < 10; i++) {
        await next()
      }
    },
    {
      warmupIterations: 100,
      time: 10_000,
      setup,
      teardown,
    },
  )
})
