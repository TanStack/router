import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactElement, ReactLazy } from '../src/reactSymbols'

import { awaitLazyElements } from '../src/awaitLazyElements'
import { CompositeComponent } from '../src/CompositeComponent'
import { createRscProxy } from '../src/createRscProxy'

describe('createRscProxy rendering', () => {
  it('a renderable proxy renders its tree inline', () => {
    const node = createRscProxy(() => <p>MARK_TREE</p>, { renderable: true })

    render(<main>{node}</main>)

    expect(screen.getByRole('main').textContent).toBe('MARK_TREE')
  })

  it('a nested selection of a renderable proxy renders that part only', () => {
    const node = createRscProxy(
      () => ({ header: <h1>MARK_HEADER</h1>, footer: <p>MARK_FOOTER</p> }),
      { renderable: true },
    )

    render(<main>{node.footer}</main>)

    expect(screen.getByRole('main').textContent).toBe('MARK_FOOTER')
  })

  it('a composite proxy renders through CompositeComponent', () => {
    const src = createRscProxy(() => <p>MARK_COMPOSITE</p>, { stream: {} })

    render(
      <main>
        <CompositeComponent src={src} />
      </main>,
    )

    expect(screen.getByRole('main').textContent).toBe('MARK_COMPOSITE')
  })
})

describe('awaitLazyElements', () => {
  /**
   * Creates a mock lazy element similar to what Flight decoder produces.
   * The _payload has a status and is thenable.
   */
  function createMockLazy(initialStatus: 'pending' | 'fulfilled' = 'pending') {
    let status = initialStatus
    const callbacks: Array<() => void> = []

    const payload = {
      get status() {
        return status
      },
      then(onFulfill: () => void) {
        if (status === 'fulfilled') {
          queueMicrotask(onFulfill)
        } else {
          callbacks.push(onFulfill)
        }
      },
    }

    return {
      $$typeof: ReactLazy,
      _payload: payload,
      _resolve() {
        status = 'fulfilled'
        callbacks.forEach((cb) => cb())
        callbacks.length = 0
      },
    }
  }

  it('awaits pending lazy elements', async () => {
    const lazy = createMockLazy()

    // Resolve after a microtask
    queueMicrotask(() => lazy._resolve())

    await awaitLazyElements(lazy)

    expect(lazy._payload.status).toBe('fulfilled')
  })

  it('skips already fulfilled lazy elements', async () => {
    const lazy = createMockLazy('fulfilled')

    // Should complete immediately without hanging
    await awaitLazyElements(lazy)

    expect(lazy._payload.status).toBe('fulfilled')
  })

  it('handles multiple lazy elements at different depths', async () => {
    const lazy1 = createMockLazy()
    const lazy2 = createMockLazy()
    const lazy3 = createMockLazy()

    const tree = {
      $$typeof: ReactElement,
      type: 'div',
      props: {
        children: [
          lazy1,
          {
            $$typeof: ReactElement,
            type: 'div',
            props: {
              children: [
                lazy2,
                {
                  $$typeof: ReactElement,
                  type: 'span',
                  props: { children: lazy3 },
                },
              ],
            },
          },
        ],
      },
    }

    // Resolve all after microtasks
    queueMicrotask(() => {
      lazy1._resolve()
      lazy2._resolve()
      lazy3._resolve()
    })

    await awaitLazyElements(tree)

    expect(lazy1._payload.status).toBe('fulfilled')
    expect(lazy2._payload.status).toBe('fulfilled')
    expect(lazy3._payload.status).toBe('fulfilled')
  })

  it('stops at Suspense boundaries', async () => {
    const lazyInsideSuspense = createMockLazy()
    const lazyOutsideSuspense = createMockLazy()

    const tree = {
      $$typeof: ReactElement,
      type: 'div',
      props: {
        children: [
          lazyOutsideSuspense,
          {
            $$typeof: ReactElement,
            type: Symbol.for('react.suspense'),
            props: { children: lazyInsideSuspense },
          },
        ],
      },
    }

    // Only resolve the outside one
    queueMicrotask(() => lazyOutsideSuspense._resolve())

    await awaitLazyElements(tree)

    // Outside should be resolved
    expect(lazyOutsideSuspense._payload.status).toBe('fulfilled')
    // Inside Suspense should NOT be awaited (still pending)
    expect(lazyInsideSuspense._payload.status).toBe('pending')
  })
})
