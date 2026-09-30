import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const LINKS = 1000

describe('inherited Link sources across configuration updates', () => {
  for (const mode of ['warm', 'context', 'configuration'] as const) {
    const root = new BaseRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 1) }),
    })
    const router = createTestRouter({
      routeTree: root.addChildren([
        new BaseRoute({ getParentRoute: () => root, path: '/source' }),
        new BaseRoute({ getParentRoute: () => root, path: '/target' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/source?page=2'] }),
      scrollRestoration: false,
    })
    const source = router.state.location
    const options = {
      to: '/target',
      search: true,
      _fromLocation: source,
    } as const
    expect(router.buildLocation(options).href).toBe('/target?page=2')
    let trailingSlash = false
    let checksum = 0
    let expected = LINKS * '/target?page=2'.length
    bench(
      mode === 'warm'
        ? 'warm shared source'
        : mode === 'context'
          ? 'context updates retain source matching'
          : 'relevant configuration changes refresh source matching',
      () => {
        if (mode === 'context') {
          router.update({ context: {} })
        } else if (mode === 'configuration') {
          trailingSlash = !trailingSlash
          router.update({ trailingSlash: trailingSlash ? 'always' : 'never' })
          expected =
            LINKS *
            (trailingSlash ? '/target/?page=2' : '/target?page=2').length
        }
        checksum = 0
        for (let index = 0; index < LINKS; index++) {
          checksum += router.buildLocation(options).href.length
        }
      },
      {
        time: 1000,
        warmupTime: 200,
        throws: true,
        teardown: () => {
          expect(checksum).toBe(expected)
          router.history.destroy()
        },
      },
    )
  }
})
