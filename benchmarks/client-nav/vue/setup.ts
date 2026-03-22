import type { NavigateOptions } from '@tanstack/router-core'
import type * as App from './app'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(appModulePath)) as typeof App

function getRequiredLink(
  container: ParentNode,
  testId: string,
  cache?: Map<string, HTMLAnchorElement>,
) {
  const cachedLink = cache?.get(testId)
  if (cachedLink) {
    return cachedLink
  }

  const link = container.querySelector<HTMLAnchorElement>(
    `[data-testid="${testId}"]`,
  )
  if (!link) {
    throw new Error(`Unable to find benchmark link: ${testId}`)
  }

  cache?.set(testId, link)
  return link
}

async function waitForRequiredLink(
  container: ParentNode,
  testId: string,
  cache?: Map<string, HTMLAnchorElement>,
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const link = container.querySelector<HTMLAnchorElement>(
      `[data-testid="${testId}"]`,
    )

    if (link) {
      cache?.set(testId, link)
      return link
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }

  return getRequiredLink(container, testId, cache)
}

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

    const click = (testId: string, cache?: Map<string, HTMLAnchorElement>) =>
      new Promise<void>((resolveNext) => {
        resolveRendered = resolveNext

        getRequiredLink(container!, testId, cache).dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        )
      })

    await router.load()

    const cachedLinks = new Map<string, HTMLAnchorElement>()
    for (const testId of ['go-items-1', 'go-items-2', 'go-search', 'go-ctx']) {
      await waitForRequiredLink(container, testId, cachedLinks)
    }

    const steps = [
      () => click('go-items-1', cachedLinks),
      () => click('items-details'),
      () =>
        navigate({
          to: '/items/$id/details',
          params: { id: 2 },
          replace: true,
        }),
      () => click('items-parent'),
      () => click('go-search', cachedLinks),
      () => click('search-next-page'),
      () =>
        navigate({
          to: '/search',
          search: { page: 1, filter: 'all' },
          replace: true,
        }),
      () => click('go-ctx', cachedLinks),
      () =>
        navigate({
          to: '/ctx/$id',
          params: { id: 2 },
        }),
      () => click('go-items-2', cachedLinks),
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
