import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'
import type { Root } from 'react-dom/client'

const appModulePath = './dist/app.js'
const { createTestRouter } = (await import(appModulePath)) as typeof App

export function setup() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'client-nav benchmark is running without NODE_ENV=production; React dev overhead will dominate results.',
    )
  }
  let id = 0
  let root: Root | undefined = undefined
  let container: HTMLDivElement | undefined = undefined
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject('Test not initialized')

  async function before() {
    id = 0
    const { router, component } = createTestRouter()
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
