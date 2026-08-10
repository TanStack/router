import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { hydrateIdAttribute } from '@tanstack/start-client-core/hydration/constants'
import { Hydrate } from '../Hydrate'
import { condition, idle, interaction, load, never } from '../hydration'
import type { HydrateProps, HydrationPrefetchStrategy } from '../Hydrate'

const InternalHydrate = Hydrate as React.ComponentType<
  HydrateProps & { p?: () => Promise<void>; h?: string }
>

const hydrateIdSelector = `[${hydrateIdAttribute}]`

function getMarker() {
  const marker = document.querySelector(hydrateIdSelector)

  if (!marker) {
    throw new Error('Expected Hydrate marker to exist')
  }

  return marker
}

function InteractiveChild() {
  const [count, setCount] = React.useState(0)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <button
      data-testid="child"
      data-hydrated={hydrated ? 'true' : 'false'}
      onClick={() => setCount((prev) => prev + 1)}
    >
      {count}
    </button>
  )
}

function NamedInteractiveChild(props: { id: string }) {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <button
      data-testid={`child-${props.id}`}
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      {props.id}
    </button>
  )
}

function createSuspendingChild() {
  let resolve!: () => void
  let resolved = false
  const promise = new Promise<void>((resolvePromise) => {
    resolve = () => {
      resolved = true
      resolvePromise()
    }
  })

  function SuspendingChild() {
    if (!resolved) {
      throw promise
    }

    return <div data-testid="child">child</div>
  }

  return { resolve, SuspendingChild }
}

async function expectNoHydrationAfterDefaultIntentEvents() {
  const marker = getMarker()

  expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
    'false',
  )

  await act(async () => {
    fireEvent.pointerEnter(marker)
    fireEvent.focusIn(marker)
    fireEvent.pointerDown(marker)
    fireEvent.click(marker)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
    'false',
  )
}

async function fireIntent(event: () => void) {
  await act(async () => {
    event()
    await Promise.resolve()
  })
}

async function renderAsync(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
    await Promise.resolve()
  })
}

function createRootCleanup(
  container: Element,
  getRoot: () => ReturnType<typeof hydrateRoot> | undefined,
) {
  let cleanedUp = false

  return async () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true

    try {
      const root = getRoot()
      if (root) {
        await act(() => {
          root.unmount()
        })
      }
    } finally {
      container.remove()
    }
  }
}

async function hydrateFromServer(ui: React.ReactElement) {
  vi.stubGlobal('window', undefined)
  const html = renderToString(ui)
  vi.unstubAllGlobals()

  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = html

  let root: ReturnType<typeof hydrateRoot> | undefined
  const cleanupRoot = createRootCleanup(container, () => root)
  onTestFinished(cleanupRoot)

  await act(async () => {
    root = hydrateRoot(container, ui)
    await Promise.resolve()
  })

  return { container, html, cleanupRoot }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Hydrate', () => {
  it('uses a single custom interaction event instead of the default intent events', async () => {
    const { html } = await hydrateFromServer(
      <Hydrate
        when={interaction({ events: 'dblclick' })}
        fallback={<div data-testid="fallback">fallback</div>}
      >
        <InteractiveChild />
      </Hydrate>,
    )

    expect(html).toContain('data-testid="child"')
    expect(html).not.toContain('data-testid="fallback"')
    expect(screen.queryByTestId('fallback')).toBeNull()
    await expectNoHydrationAfterDefaultIntentEvents()

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })

  it('uses every event in a custom interaction event list', async () => {
    await hydrateFromServer(
      <Hydrate
        when={interaction({ events: ['contextmenu', 'dblclick'] })}
        fallback={<div data-testid="fallback">fallback</div>}
      >
        <InteractiveChild />
      </Hydrate>,
    )

    expect(screen.queryByTestId('fallback')).toBeNull()
    await expectNoHydrationAfterDefaultIntentEvents()

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })

  it('omits never content when mounted after the app is already hydrated', async () => {
    await renderAsync(
      <Hydrate when={never()}>
        <InteractiveChild />
      </Hydrate>,
    )

    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('shows fallback for a client-only mount while children suspend', async () => {
    const { resolve, SuspendingChild } = createSuspendingChild()

    await renderAsync(
      <Hydrate
        when={load()}
        fallback={<div data-testid="fallback">fallback</div>}
      >
        <SuspendingChild />
      </Hydrate>,
    )

    expect(screen.getByTestId('fallback').textContent).toBe('fallback')
    expect(screen.queryByTestId('child')).toBeNull()

    await act(async () => {
      resolve()
      await Promise.resolve()
    })

    await screen.findByTestId('child')
    expect(screen.queryByTestId('fallback')).toBeNull()
  })

  it('does not use fallback for an initial never boundary', async () => {
    const { html } = await hydrateFromServer(
      <Hydrate
        when={never()}
        fallback={<div data-testid="fallback">fallback</div>}
      >
        <InteractiveChild />
      </Hydrate>,
    )

    expect(html).toContain('data-testid="child"')
    expect(html).not.toContain('data-testid="fallback"')
    expect(screen.queryByTestId('fallback')).toBeNull()

    fireEvent.click(screen.getByTestId('child'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
      'false',
    )
    expect(screen.getByTestId('child').textContent).toBe('0')
  })

  it('keeps repeated split boundaries independently gated', async () => {
    const { container } = await hydrateFromServer(
      <>
        <InternalHydrate when={interaction()} h="shared-boundary">
          <NamedInteractiveChild id="one" />
        </InternalHydrate>
        <InternalHydrate when={interaction()} h="shared-boundary">
          <NamedInteractiveChild id="two" />
        </InternalHydrate>
      </>,
    )

    const markers = container.querySelectorAll(hydrateIdSelector)

    expect(markers).toHaveLength(2)
    expect(markers[0]!.getAttribute(hydrateIdAttribute)).not.toBe(
      markers[1]!.getAttribute(hydrateIdAttribute),
    )
    expect(screen.getByTestId('child-one').getAttribute('data-hydrated')).toBe(
      'false',
    )
    expect(screen.getByTestId('child-two').getAttribute('data-hydrated')).toBe(
      'false',
    )

    await fireIntent(() =>
      markers[0]!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(
        screen.getByTestId('child-one').getAttribute('data-hydrated'),
      ).toBe('true'),
    )
    expect(screen.getByTestId('child-two').getAttribute('data-hydrated')).toBe(
      'false',
    )
  })

  it('fires onHydrated once after the client hydration commit', async () => {
    const onHydrated = vi.fn()
    const app = (
      <Hydrate when={load()} onHydrated={onHydrated}>
        <div data-testid="child">child</div>
      </Hydrate>
    )

    vi.stubGlobal('window', undefined)
    const html = renderToString(app)
    expect(html).toContain('child')
    expect(onHydrated).not.toHaveBeenCalled()
    vi.unstubAllGlobals()

    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = html

    let root: ReturnType<typeof hydrateRoot> | undefined
    const cleanupRoot = createRootCleanup(container, () => root)
    onTestFinished(cleanupRoot)

    await act(() => {
      root = hydrateRoot(container, app)
    })

    await waitFor(() => expect(onHydrated).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('child'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onHydrated).toHaveBeenCalledTimes(1)
  })

  it('prefetches split children without hydrating the boundary', async () => {
    const preload = vi.fn(() => Promise.resolve())

    await hydrateFromServer(
      <InternalHydrate
        when={interaction()}
        prefetch={idle({ timeout: 1 })}
        p={preload}
      >
        <InteractiveChild />
      </InternalHydrate>,
    )

    await waitFor(() => expect(preload).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
      'false',
    )

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
    expect(preload).toHaveBeenCalledTimes(1)
  })

  it('does not evaluate dynamic when callbacks on the server', async () => {
    const when = vi.fn(() => interaction({ events: 'dblclick' }))

    vi.stubGlobal('window', undefined)
    const html = renderToString(
      <Hydrate when={when}>
        <InteractiveChild />
      </Hydrate>,
    )
    vi.unstubAllGlobals()

    expect(when).not.toHaveBeenCalled()
    expect(html).toContain('data-ts-hydrate-when="dynamic"')

    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = html

    let root: ReturnType<typeof hydrateRoot> | undefined
    const cleanupRoot = createRootCleanup(container, () => root)
    onTestFinished(cleanupRoot)

    await act(async () => {
      root = hydrateRoot(
        container,
        <Hydrate when={when}>
          <InteractiveChild />
        </Hydrate>,
      )
      await Promise.resolve()
    })

    expect(when).toHaveBeenCalled()
    await expectNoHydrationAfterDefaultIntentEvents()

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })

  it('replays an interaction captured before the Hydrate component hydrates', async () => {
    const when = () => interaction({ events: 'click' })

    vi.stubGlobal('window', undefined)
    const html = renderToString(
      <Hydrate when={when}>
        <InteractiveChild />
      </Hydrate>,
    )
    vi.unstubAllGlobals()

    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = html

    let root: ReturnType<typeof hydrateRoot> | undefined
    const cleanupRoot = createRootCleanup(container, () => root)
    onTestFinished(cleanupRoot)

    const button = container.querySelector('[data-testid="child"]')
    if (!button) {
      throw new Error('Expected server-rendered child button')
    }

    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )

    await act(async () => {
      root = hydrateRoot(
        container,
        <Hydrate when={when}>
          <InteractiveChild />
        </Hydrate>,
      )
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
    await waitFor(() =>
      expect(screen.getByTestId('child').textContent).toBe('1'),
    )
  })

  it('blocks hydration on awaited procedural prefetch work', async () => {
    const preload = vi.fn(() => Promise.resolve())
    let resolvePrefetch!: () => void
    const prefetchBlocker = new Promise<void>((resolve) => {
      resolvePrefetch = resolve
    })
    const waitReasons: Array<string> = []
    const neverPrefetches = {
      _t: 'idle',
      _s: () => () => {},
    } as HydrationPrefetchStrategy<'idle'>

    await hydrateFromServer(
      <InternalHydrate
        when={interaction()}
        prefetch={async ({ waitFor, preload }) => {
          waitReasons.push(await waitFor(neverPrefetches))
          await preload()
          await prefetchBlocker
        }}
        p={preload}
      >
        <InteractiveChild />
      </InternalHydrate>,
    )

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() => expect(waitReasons).toEqual(['hydrate']))
    expect(preload).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
      'false',
    )

    await act(async () => {
      resolvePrefetch()
      await prefetchBlocker
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })

  it('hydrates when a condition strategy changes after the initial render', async () => {
    function ConditionHarness() {
      const [ready, setReady] = React.useState(false)

      return (
        <>
          <button data-testid="ready" onClick={() => setReady(true)}>
            ready
          </button>
          <Hydrate when={condition(ready)}>
            <InteractiveChild />
          </Hydrate>
        </>
      )
    }

    await hydrateFromServer(<ConditionHarness />)

    expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
      'false',
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('ready'))
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })

  it('does not block hydration on fire-and-forget procedural prefetch work', async () => {
    let resolvePrefetch!: () => void
    const prefetchBlocker = new Promise<void>((resolve) => {
      resolvePrefetch = resolve
    })

    await hydrateFromServer(
      <InternalHydrate
        when={interaction()}
        prefetch={() => {
          void prefetchBlocker
        }}
      >
        <InteractiveChild />
      </InternalHydrate>,
    )

    await fireIntent(() =>
      getMarker().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )

    await act(async () => {
      resolvePrefetch()
      await prefetchBlocker
    })
  })

  it('aborts procedural prefetch when the boundary unmounts', async () => {
    const signals: Array<AbortSignal> = []

    const { cleanupRoot } = await hydrateFromServer(
      <InternalHydrate
        when={interaction()}
        prefetch={({ signal }) => {
          signals.push(signal)
          return new Promise<void>(() => {})
        }}
      >
        <InteractiveChild />
      </InternalHydrate>,
    )

    expect(signals).toHaveLength(1)
    expect(signals[0]!.aborted).toBe(false)

    await cleanupRoot()
    expect(signals[0]!.aborted).toBe(true)
  })

  it('delegates nested interaction boundaries at runtime', async () => {
    await hydrateFromServer(
      <Hydrate when={idle({ timeout: 1000 })}>
        <Hydrate when={interaction()}>
          <InteractiveChild />
        </Hydrate>
      </Hydrate>,
    )

    expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
      'false',
    )

    await fireIntent(() => {
      fireEvent.click(screen.getByTestId('child'))
    })

    await waitFor(() =>
      expect(screen.getByTestId('child').getAttribute('data-hydrated')).toBe(
        'true',
      ),
    )
  })
})
