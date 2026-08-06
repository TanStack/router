import { afterEach, describe, expect, test, vi } from 'vitest'

import { createBrowserHistory } from '../src'
import type { RouterHistory } from '../src'

describe('createBrowserHistory', () => {
  let history: RouterHistory | undefined

  afterEach(() => {
    history?.destroy()
    history = undefined
  })

  // Establishes two entries in the browser session history (`/one` then `/two`)
  // and returns a browser history positioned on the second entry, so that a
  // subsequent `go(-1)` produces a real `popstate` that reaches the blocker
  // handling in `onPushPopEvent`.
  function setupTwoEntries(): RouterHistory {
    window.history.replaceState({ __TSR_index: 0, __TSR_key: 'one' }, '', '/one')
    window.history.pushState({ __TSR_index: 1, __TSR_key: 'two' }, '', '/two')
    history = createBrowserHistory()
    return history
  }

  describe('go respects the ignoreBlocker option', () => {
    test('go(-1) runs registered blockers by default', async () => {
      const history = setupTwoEntries()
      const blockerFn = vi.fn(async () => true)
      history.block({ blockerFn })

      history.go(-1)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(blockerFn).toHaveBeenCalledTimes(1)
    })

    test('go(-1, { ignoreBlocker: true }) skips registered blockers', async () => {
      const history = setupTwoEntries()
      const blockerFn = vi.fn(async () => true)
      history.block({ blockerFn })

      history.go(-1, { ignoreBlocker: true })
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(blockerFn).not.toHaveBeenCalled()
    })
  })
})
