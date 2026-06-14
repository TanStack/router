import type * as App from './src/app'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App

export function setup() {
  warnClientNavDevMode('solid')

  const lifecycle = createClientNavLifecycle({ mountTestApp })
  let stepIndex = 0

  const steps = [
    () => lifecycle.click('go-items-1'),
    () => lifecycle.click('items-details'),
    () =>
      lifecycle.navigate({
        to: '/items/$id/details',
        params: { id: 2 },
        replace: true,
      }),
    () => lifecycle.click('items-parent'),
    () => lifecycle.click('go-search'),
    () => lifecycle.click('search-next-page'),
    () =>
      lifecycle.navigate({
        to: '/search',
        search: { page: 1, filter: 'all' },
        replace: true,
      }),
    () => lifecycle.click('go-ctx'),
    () =>
      lifecycle.navigate({
        to: '/ctx/$id',
        params: { id: 2 },
        replace: true,
      }),
    () => lifecycle.click('go-items-2'),
  ] as const

  async function prepareLinks() {
    for (const testId of ['go-items-1', 'go-items-2', 'go-search', 'go-ctx']) {
      await lifecycle.waitForLink(testId)
    }
  }

  async function before() {
    stepIndex = 0
    await lifecycle.before()
    await prepareLinks()
  }

  async function sanity() {
    await lifecycle.before()

    try {
      await lifecycle.navigate({
        to: '/search',
        search: { page: 1, filter: 'all' },
        replace: true,
      })
      await lifecycle.waitForLink('search-next-page')
    } finally {
      await lifecycle.after()
    }
  }

  function tick() {
    const step = steps[stepIndex % steps.length]!
    stepIndex += 1
    return step()
  }

  return {
    before,
    sanity,
    tick,
    after: lifecycle.after,
  }
}
