import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'
import { GenericHydrate } from '../GenericHydrate'
import { never } from '../hydration/never'

vi.mock('@tanstack/router-core/isServer', () => ({ isServer: false }))

const disposers: Array<() => void> = []

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

test('sets up many islands without searching the document for their markers', () => {
  const container = document.createElement('div')
  document.body.append(container)
  const query = vi.spyOn(document, 'querySelectorAll')
  disposers.push(
    render(
      () =>
        Array.from({ length: 100 }, () => (
          <GenericHydrate when={never()} fallback="waiting">
            content
          </GenericHydrate>
        )),
      container,
    ),
  )

  expect(container.querySelectorAll('[data-ts-hydrate-id]')).toHaveLength(100)
  expect(query).not.toHaveBeenCalledWith('[data-ts-hydrate-id]')
})

test('passes each boundary marker to its prefetch callback', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const prefetch = vi.fn(async () => {})
  disposers.push(
    render(
      () => (
        <>
          <GenericHydrate when={never()} prefetch={prefetch}>
            first
          </GenericHydrate>
          <GenericHydrate when={never()} prefetch={prefetch}>
            second
          </GenericHydrate>
        </>
      ),
      container,
    ),
  )
  await Promise.resolve()

  const markers = container.querySelectorAll('[data-ts-hydrate-id]')
  expect(markers).toHaveLength(2)
  expect(prefetch).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ element: markers[0] }),
  )
  expect(prefetch).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ element: markers[1] }),
  )
})
