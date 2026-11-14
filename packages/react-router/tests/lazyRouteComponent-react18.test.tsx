import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import { lazyRouteComponent } from '../src'

// React 18 has no `use()`; lazy components suspend by throwing instead.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  use: undefined,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('without use(), a lazy component suspends until its chunk arrives', async () => {
  expect((React as any).use).toBeUndefined()
  const screenImport = createControlledPromise<{
    default: () => React.JSX.Element
  }>()
  const Screen = lazyRouteComponent(() => screenImport)

  render(
    <React.Suspense fallback={<p>Loading screen</p>}>
      <Screen />
    </React.Suspense>,
  )
  expect(screen.getByText('Loading screen')).toBeInTheDocument()

  await act(async () => {
    screenImport.resolve({ default: () => <p>Screen content</p> })
  })
  expect(await screen.findByText('Screen content')).toBeInTheDocument()
})

test('without use(), a preloaded lazy component renders without suspending', async () => {
  const Screen = lazyRouteComponent(() =>
    Promise.resolve({ default: () => <p>Screen content</p> }),
  )
  await Screen.preload?.()
  const Fallback = vi.fn(() => <p>Loading screen</p>)

  render(
    <React.Suspense fallback={<Fallback />}>
      <Screen />
    </React.Suspense>,
  )

  expect(screen.getByText('Screen content')).toBeInTheDocument()
  expect(Fallback).not.toHaveBeenCalled()
})
