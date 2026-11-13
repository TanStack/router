import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import { lazyRouteComponent } from '../src'

// https://github.com/TanStack/router/issues/8827
const message =
  'error loading dynamically imported module: http://localhost/assets/page.js'
const reloadKey = `tanstack_router_reload:${message}`

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

test('does not reload when the import is cancelled because the page is unloading', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const first = createControlledPromise<never>()
  const importer = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce({ default: () => <div>Loaded</div> })
  const Page = lazyRouteComponent(importer)

  const preload = Page.preload!()
  window.dispatchEvent(new Event('beforeunload'))
  first.reject(new TypeError(message))
  await preload

  render(() => <Page />)
  expect(sessionStorage.getItem(reloadKey)).toBeNull()

  // The page stayed after all, so the import is retried.
  fireEvent.pointerDown(document.body)
  expect(await screen.findByText('Loaded')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(sessionStorage.getItem(reloadKey)).toBeNull()
})

test('still reloads once for a missing module when the page is not unloading', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Page = lazyRouteComponent(() => Promise.reject(new TypeError(message)))

  await Page.preload!()
  render(() => <Page />)

  expect(sessionStorage.getItem(reloadKey)).toBe('1')
})
