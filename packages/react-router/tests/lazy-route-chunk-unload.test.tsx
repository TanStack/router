import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

// jsdom cannot reload, so React retries the render and reaches the error that
// the reload guard rethrows once its key is set.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: undefined }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    return this.state.error ? <div>Error</div> : this.props.children
  }
}

function renderLazy(Page: ReturnType<typeof lazyRouteComponent>) {
  return render(
    <ErrorBoundary>
      <React.Suspense fallback={<div>Loading</div>}>
        <Page />
      </React.Suspense>
    </ErrorBoundary>,
  )
}

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

  renderLazy(Page)
  expect(screen.getByText('Loading')).toBeInTheDocument()
  expect(sessionStorage.getItem(reloadKey)).toBeNull()

  // The page stayed after all, so the import is retried.
  fireEvent.pointerDown(document.body)
  expect(await screen.findByText('Loaded')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(sessionStorage.getItem(reloadKey)).toBeNull()
})

test('reloads once if the retried import is still missing after the page stays', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const first = createControlledPromise<never>()
  const importer = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockRejectedValueOnce(new TypeError(message))
  const Page = lazyRouteComponent(importer)

  const preload = Page.preload!()
  window.dispatchEvent(new Event('beforeunload'))
  first.reject(new TypeError(message))
  await preload

  renderLazy(Page)
  fireEvent.keyDown(document.body)
  await vi.waitFor(() => expect(sessionStorage.getItem(reloadKey)).toBe('1'))
  expect(importer).toHaveBeenCalledTimes(2)
})

test('still reloads once for a missing module when the page is not unloading', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Page = lazyRouteComponent(() => Promise.reject(new TypeError(message)))

  await Page.preload!()
  renderLazy(Page)

  expect(sessionStorage.getItem(reloadKey)).toBe('1')
})

test('stops watching for unload once the import settles', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Page = lazyRouteComponent(() => Promise.reject(new TypeError(message)))

  await Page.preload!()
  // A later unload must not be attributed to the import that already failed.
  window.dispatchEvent(new Event('beforeunload'))
  renderLazy(Page)

  expect(sessionStorage.getItem(reloadKey)).toBe('1')
})
