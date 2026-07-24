import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { lazyRouteComponent } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a component loads when rendered before preload', async () => {
  const importer = vi.fn().mockResolvedValue({
    default: () => <div>Page content</div>,
  })
  const Page = lazyRouteComponent(importer)

  render(() => <Page />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(1)
})
