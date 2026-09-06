import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import * as utils from '../src/utils'
import { createTestRouter } from './routerTestUtils'

const environment = vi.hoisted(() => {
  const value: { isServer: boolean | undefined } = { isServer: undefined }
  return value
})

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get isServer() {
    return environment.isServer
  },
}))

afterEach(() => {
  environment.isServer = undefined
  vi.restoreAllMocks()
})

test.each([false, true])(
  'prefers the compile-time server mode (%s) for empty-search reuse',
  (isServer) => {
    environment.isServer = isServer
    const root = new BaseRootRoute({})
    const route = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: !isServer,
    })
    try {
      const inherited = router.buildLocation({ to: '/', search: true })
      const share = vi.spyOn(utils, 'nullReplaceEqualDeep')
      const cleared = router.buildLocation({ to: '/' })
      const searchBeforeSharing = share.mock.calls.find(
        ([previous]) => previous === inherited.search,
      )?.[1]
      expect(searchBeforeSharing).toEqual({})
      if (isServer) {
        expect(searchBeforeSharing).not.toBe(inherited.search)
      } else {
        expect(searchBeforeSharing).toBe(inherited.search)
      }
      expect(cleared.search).toEqual({})
      expect(cleared.searchStr).toBe('')
    } finally {
      history.destroy()
    }
  },
)
