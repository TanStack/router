/**
 * Regression test: `MatchContext` must set its context value inside the
 * RENDER function, not the setup phase. Remix UI reuses same-type
 * component vnodes across navigations and only the render function
 * sees fresh props on each pass — setting context in setup freezes it
 * to the initial matchId, which broke nested-route SPA navigation
 * (descendant `<Outlet>`s captured a stale `parentMatchId` and
 * returned `null`).
 *
 * Test strategy: drive the factory with a hand-rolled handle and a
 * spy on `context.set`. After the setup call (= invoking `MatchContext(handle)`),
 * `context.set` must NOT have been called. After invoking the returned
 * render fn with a `matchId`, it MUST have been called with that id.
 */
import { describe, expect, test, vi } from 'vitest'
import { MatchContext, getMatchId } from '../src/MatchContext'
import type { Handle } from '@remix-run/ui'

interface FakeHandle {
  context: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
  props: { matchId: string; children?: unknown }
}

function makeFakeHandle(initialMatchId: string): FakeHandle {
  return {
    context: { set: vi.fn(), get: vi.fn() },
    props: { matchId: initialMatchId },
  }
}

describe('MatchContext', () => {
  test('does NOT set context during setup phase', () => {
    const handle = makeFakeHandle('initial')
    MatchContext(handle as unknown as Handle<any, any>)
    expect(handle.context.set).not.toHaveBeenCalled()
  })

  test('sets context when render fn is invoked', () => {
    const handle = makeFakeHandle('initial')
    const render = MatchContext(handle as unknown as Handle<any, any>)
    render({ matchId: 'first', children: null } as any)
    expect(handle.context.set).toHaveBeenCalledWith('first')
  })

  test('reflects the latest matchId on subsequent renders', () => {
    const handle = makeFakeHandle('initial')
    const render = MatchContext(handle as unknown as Handle<any, any>)
    render({ matchId: 'one', children: null } as any)
    render({ matchId: 'two', children: null } as any)
    render({ matchId: 'three', children: null } as any)
    expect(handle.context.set).toHaveBeenCalledTimes(3)
    expect(handle.context.set).toHaveBeenNthCalledWith(1, 'one')
    expect(handle.context.set).toHaveBeenNthCalledWith(2, 'two')
    expect(handle.context.set).toHaveBeenNthCalledWith(3, 'three')
  })
})

describe('getMatchId', () => {
  test('reads MatchContext from handle.context.get', () => {
    const handle = {
      context: { get: vi.fn().mockReturnValue('xyz') },
    }
    const id = getMatchId(handle as unknown as Handle<any, any>)
    expect(handle.context.get).toHaveBeenCalledWith(MatchContext)
    expect(id).toBe('xyz')
  })

  test('returns undefined when context.get returns undefined', () => {
    const handle = {
      context: { get: vi.fn().mockReturnValue(undefined) },
    }
    const id = getMatchId(handle as unknown as Handle<any, any>)
    expect(id).toBeUndefined()
  })
})
