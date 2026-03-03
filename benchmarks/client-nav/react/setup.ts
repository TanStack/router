import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'
import type { Root } from 'react-dom/client'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

export function setup() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'client-nav flame benchmark is running without NODE_ENV=production; React dev overhead will dominate results.',
    )
  }
  let id = 0
  const { router, component } = createTestRouter()
  let root: Root | undefined = undefined
  let container: HTMLDivElement | undefined = undefined
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function before() {
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
        // update search every 2 navigations, to still test them, but also measure the impact of granular re-rendering
        search: { id: Math.floor(nextId / 2) },
        replace: true,
      })
    }

    const { createRoot } = await import('react-dom/client')

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    root.render(component)
    await router.load()
  }

  function after() {
    root?.unmount()
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
