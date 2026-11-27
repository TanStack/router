import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Hydrate } from '../Hydrate'
import { idle } from '../hydration'
import type * as ReactRouter from '@tanstack/react-router'

const useStatuses = vi.hoisted(() => [] as Array<string | undefined>)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    reactUse: (usable: Promise<unknown> & { status?: string }) => {
      useStatuses.push(usable.status)
      return actual.reactUse!(usable)
    },
  }
})

// React 19 warns when a component suspends through use() and then finishes a
// later render without calling it.
it('keeps calling use() after the hydration gate resolves', async () => {
  const app = (
    <Hydrate when={idle({ timeout: 10 })}>
      <button data-testid="child">child</button>
    </Hydrate>
  )

  vi.stubGlobal('window', undefined)
  const html = renderToString(app)
  vi.unstubAllGlobals()

  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = html

  const onHydrationError = vi.fn()
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, app, {
      onRecoverableError: onHydrationError,
    })
  })

  await waitFor(() => expect(useStatuses.at(-1)).toBe('fulfilled'))
  expect(screen.getByTestId('child').textContent).toBe('child')
  expect(onHydrationError).not.toHaveBeenCalled()

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
