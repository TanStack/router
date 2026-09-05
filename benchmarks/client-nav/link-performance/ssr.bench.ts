import { afterEach, beforeEach, bench, describe } from 'vitest'
import { JSDOM } from 'jsdom'
import { benchOptions } from '../scenarios/links/shared'
import { LINK_CASES, NAVIGATION_STATES, assertScenario } from './cases'
import type * as App from './src/ssr'

const appUrl = new URL('./dist/ssr/app.js', import.meta.url).href
const app: typeof App = await import(/* @vite-ignore */ appUrl)
if (app.serverEnvironment !== true) {
  throw new Error('Link SSR benchmarks must use the production server build')
}

for (const { id, label } of LINK_CASES) {
  describe(label, () => {
    let html = ''
    let state = 0

    function assertHtml() {
      const dom = new JSDOM(html)
      try {
        assertScenario(id, state, dom.window.document)
      } finally {
        dom.window.close()
      }
    }

    async function prepare() {
      for (const nextState of NAVIGATION_STATES) {
        state = nextState
        html = await app.renderScenario(id, state, true)
        assertHtml()
      }
    }

    beforeEach(prepare)
    afterEach(assertHtml)

    bench(
      `SSR Links: ${id}`,
      async () => {
        for (const nextState of NAVIGATION_STATES) {
          state = nextState
          html = await app.renderScenario(id, state)
        }
      },
      {
        ...benchOptions,
        time: 3_000,
        setup: prepare,
        teardown: assertHtml,
      },
    )
  })
}
