import { expect, test } from 'vitest'
import { render } from 'solid-js/web'
import { Hydrate } from '../Hydrate'
import { condition, never } from '../hydration'

test('renders the first client-only boundary without waiting for its hydration strategy', () => {
  const container = document.createElement('div')
  const dispose = render(
    () => (
      <>
        <Hydrate when={condition(() => false)} fallback="waiting">
          static content
        </Hydrate>
        <Hydrate when={() => condition(() => false)} fallback="waiting">
          dynamic content
        </Hydrate>
        <Hydrate when={never()} fallback="never fallback">
          never content
        </Hydrate>
      </>
    ),
    container,
  )
  try {
    expect(container.textContent).toBe(
      'static contentdynamic contentnever fallback',
    )
  } finally {
    dispose()
  }
})
