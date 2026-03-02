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
  let next: () => Promise<void> = () => Promise.reject()

  beforeAll(async () => {
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
  })

  afterAll(() => {
    cleanup()
    unsub()
  })

  bench('client-side navigation loop (solid)', () => next(), {
    warmupIterations: 1,
    iterations: 100,
  })
})
