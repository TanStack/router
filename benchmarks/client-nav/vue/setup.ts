import type { NavigateOptions } from '@tanstack/router-core'
import type { App as VueApp } from 'vue'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

export function setup() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'client-nav benchmark is running without NODE_ENV=production; Vue dev overhead will dominate results.',
    )
  }

  let id = 0
  let app: VueApp | undefined = undefined
  let container: HTMLDivElement | undefined = undefined
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function before() {
    id = 0
    const { router, component } = createTestRouter()
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
      const nextId = id++

      return navigate({
        to: '/$id',
        params: { id: nextId },
        // update search every 2 navigations, to still test them, but also measure the impact of granular re-rendering
        search: { id: Math.floor(nextId / 2) },
        replace: true,
      })
    }

    const { createApp } = await import('vue')

    container = document.createElement('div')
    document.body.append(container)
    app = createApp({
      render: () => component,
    })
    app.mount(container)
    await router.load()
  }

  function after() {
    app?.unmount()
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
