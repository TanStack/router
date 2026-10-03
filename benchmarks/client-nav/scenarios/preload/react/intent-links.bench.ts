import { afterEach, beforeEach, bench, describe } from 'vitest'
import type * as App from './src/main'

const appModulePath = './dist/app.js'
const { mountIntentLinks }: typeof App = await import(
  /* @vite-ignore */ appModulePath
)

describe('intent Link collection lifecycle', () => {
  let container: HTMLDivElement
  function before() {
    container = document.createElement('div')
    document.body.append(container)
    const unmount = mountIntentLinks(container)
    try {
      if (container.querySelectorAll('a').length !== 200) {
        throw new Error('Expected 200 mounted intent Links')
      }
    } finally {
      unmount()
    }
    if (container.childNodes.length !== 0) {
      throw new Error('Expected the Link collection to unmount')
    }
  }
  function after() {
    container.remove()
  }
  beforeEach(before)
  afterEach(after)
  bench(
    'mount/unmount 200 intent Links without hovering (react)',
    () => {
      for (let i = 0; i < 6; i++) {
        mountIntentLinks(container)()
      }
    },
    {
      setup: before,
      teardown: after,
      warmupIterations: 10,
      time: 1000,
      throws: true,
    },
  )
})
