import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { lazyRouteComponent } from '../src'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

test('a successful retry clears reload intent from an earlier module-not-found preload', async () => {
  sessionStorage.clear()

  const PageContent = () => React.createElement('div', null, 'Page content')
  const moduleError = new TypeError(
    'Failed to fetch dynamically imported module: /assets/page.js',
  )
  const reloadKey = `tanstack_router_reload:${moduleError.message}`
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(moduleError)
    .mockResolvedValueOnce({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  await Page.preload()
  expect(sessionStorage.getItem(reloadKey)).toBe('1')
  await Page.preload()

  // Avoid invoking JSDOM's real Location.reload while still observing whether
  // the component retained the first attempt's reload intent.
  const reload = vi.fn()
  vi.stubGlobal('window', { location: { reload } })

  let element: React.ReactElement | undefined
  expect
    .soft(() => {
      element = (Page as (props: object) => React.ReactElement)({})
    })
    .not.toThrow()
  expect.soft(element?.type).toBe(PageContent)
  expect.soft(reload).not.toHaveBeenCalled()
  expect(importer).toHaveBeenCalledTimes(2)
})
