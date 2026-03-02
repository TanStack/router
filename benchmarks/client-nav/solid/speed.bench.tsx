import { cleanup, render } from '@solidjs/testing-library'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

describe('client-nav', () => {
  let id = 0
  let router: ReturnType<typeof createTestRouter>['router']
  let component: ReturnType<typeof createTestRouter>['component']
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function setup() {
    id = 0
    const testRouter = createTestRouter()
    router = testRouter.router
    component = testRouter.component
    let resolveRendered: () => void = () => {}
    unsub = router.subscribe('onRendered', () => {
      resolveRendered()
    })

    const navigate = (opts: NavigateOptions) =>
      new Promise<void>((resolveNext) => {
        resolveRendered = resolveNext
        router.navigate(opts)
      })

    next = () => {
      const nextId = String(id++)

      return navigate({
        to: '/$id',
        params: { id: nextId },
        search: { id: nextId },
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
    'client-side navigation loop (solid)',
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
