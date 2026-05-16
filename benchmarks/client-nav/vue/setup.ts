import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(appModulePath)) as typeof App

export function setup() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'client-nav benchmark is running without NODE_ENV=production; Vue dev overhead will dominate results.',
    )
  }

  let container: HTMLDivElement | undefined = undefined
  let unmount: (() => void) | undefined = undefined
  let unsub = () => {}
  let stepIndex = 0
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function before() {
    stepIndex = 0
    container = document.createElement('div')
    document.body.append(container)

    const { router, unmount: dispose } = mountTestApp(container)
    unmount = dispose

    let resolveRendered: () => void = () => {}
    unsub = router.subscribe('onRendered', () => {
      resolveRendered()
    })

    const navigate = (opts: NavigateOptions) =>
      new Promise<void>((resolveNext) => {
        resolveRendered = resolveNext
        router.navigate(opts)
      })

    await router.load()

    const steps = [
      () =>
        navigate({
          to: '/items/$id',
          params: { id: 1 },
          replace: true,
        }),
      () =>
        navigate({
          from: '/items/$id',
          to: './details',
          replace: true,
        }),
      () =>
        navigate({
          to: '/items/$id/details',
          params: { id: 2 },
          replace: true,
        }),
      () =>
        navigate({
          from: '/items/$id/details',
          to: '..',
          replace: true,
        }),
      () =>
        navigate({
          to: '/search',
          search: { page: 1, filter: 'all', junk: 'group-0' },
          replace: true,
        }),
      () =>
        navigate({
          from: '/search',
          to: '.',
          replace: true,
          search: (prev: { page: number; filter: string }) => ({
            page: prev.page + 1,
            filter: prev.filter,
            junk: 'local-updater',
          }),
        }),
      () =>
        navigate({
          to: '/search',
          search: { page: 1, filter: 'all' },
          replace: true,
        }),
      () =>
        navigate({
          to: '/ctx/$id',
          params: { id: 1 },
          search: true,
          replace: true,
        }),
      () =>
        navigate({
          to: '/ctx/$id',
          params: { id: 2 },
          replace: true,
        }),
      () =>
        navigate({
          to: '/items/$id',
          params: { id: 2 },
          replace: true,
        }),
    ] as const

    next = () => {
      const step = steps[stepIndex % steps.length]!
      stepIndex += 1
      return step()
    }
  }

  function after() {
    unmount?.()
    container?.remove()
    unsub()
  }

  function tick() {
    return next()
  }

  return {
    before,
    tick,
    after,
  }
}
