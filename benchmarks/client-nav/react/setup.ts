import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(appModulePath)) as typeof App

type Scenario = App.Scenario

export function setup(scenario: Scenario = 'default') {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'client-nav benchmark is running without NODE_ENV=production; React dev overhead will dominate results.',
    )
  }
  let id = 0
  let unmount: (() => void) | undefined = undefined
  let container: HTMLDivElement | undefined = undefined
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function before() {
    id = 0
    container = document.createElement('div')
    document.body.append(container)

    const { router, unmount: dispose } = mountTestApp(container, scenario)
    unmount = dispose
    let resolve: () => void = () => {}
    unsub = router.subscribe('onRendered', () => resolve())

    const navigate = (opts: NavigateOptions) =>
      new Promise<void>((resolveNext) => {
        resolve = resolveNext
        router.navigate(opts)
      })

    next =
      scenario === 'default'
        ? () => {
            const nextId = id++

            return navigate({
              to: '/$id',
              params: { id: nextId },
              // update search every 2 navigations, to still test them, but also measure the impact of granular re-rendering
              search: { id: Math.floor(nextId / 2) },
              replace: true,
            })
          }
        : () =>
            navigate({
              to: '/links',
              search: { id: id++ },
              replace: true,
            })
    await router.load()
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
