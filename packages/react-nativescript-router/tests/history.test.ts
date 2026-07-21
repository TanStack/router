import { describe, expect, test, vi } from 'vitest'
import { createNativeScriptHistory } from '../src/history'
import type { BlockerFnArgs } from '@tanstack/history'

describe('createNativeScriptHistory', () => {
  test('preserves URL state and branches after back navigation', () => {
    const history = createNativeScriptHistory({ initialPath: '/?tab=home' })

    history.push('/posts?sort=new#top', { source: 'test' })
    history.push('/settings')
    history.back()
    history.push('/profile')

    expect(history.location).toMatchObject({
      href: '/profile',
      pathname: '/profile',
      search: '',
      hash: '',
      state: { __TSR_index: 2 },
    })
    expect(history.getStackSnapshot().map((entry) => entry.href)).toEqual([
      '/?tab=home',
      '/posts?sort=new#top',
      '/profile',
    ])
  })

  test('honors an initial index of zero', () => {
    const history = createNativeScriptHistory({
      initialEntries: ['/', '/one', '/two'],
      initialIndex: 0,
    })

    expect(history.location.pathname).toBe('/')
    expect(history.canGoBack()).toBe(false)
  })

  test('assigns a new location key on replace without changing depth', () => {
    const history = createNativeScriptHistory()
    const previousKey = history.location.state.__TSR_key

    history.replace('/replacement')

    expect(history.length).toBe(1)
    expect(history.location.state.__TSR_index).toBe(0)
    expect(history.location.state.__TSR_key).not.toBe(previousKey)
  })

  test('blocks push and pop navigation before mutating history', async () => {
    const history = createNativeScriptHistory()
    history.push('/one')
    const blocker = vi.fn((_args: BlockerFnArgs) => true)
    history.block({ blockerFn: blocker })

    await history.push('/two')
    expect(history.location.pathname).toBe('/one')

    await history.back()
    expect(history.location.pathname).toBe('/one')
    expect(blocker).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'PUSH' }),
    )
    expect(blocker).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'BACK',
        nextLocation: expect.objectContaining({ pathname: '/' }),
      }),
    )
  })

  test('continues an asynchronous blocker and supports ignoreBlocker', async () => {
    const history = createNativeScriptHistory()
    history.push('/one')
    history.block({ blockerFn: () => Promise.resolve(false) })

    await history.back()
    expect(history.location.pathname).toBe('/')

    history.push('/two', undefined, { ignoreBlocker: true })
    expect(history.location.pathname).toBe('/two')
  })

  test('settles only after an asynchronous blocker decides', async () => {
    const history = createNativeScriptHistory()
    history.push('/one')
    let allowNavigation!: (blocked: boolean) => void
    history.block({
      blockerFn: () =>
        new Promise<boolean>((resolve) => {
          allowNavigation = resolve
        }),
    })

    const navigation = history.back()
    expect(history.location.pathname).toBe('/one')

    allowNavigation(false)
    await navigation

    expect(history.location.pathname).toBe('/')
  })

  test('notifies when blocker availability changes', () => {
    const history = createNativeScriptHistory()
    const listener = vi.fn()
    const unsubscribe = history.subscribeBlockers(listener)
    const unblock = history.block({ blockerFn: () => false })

    expect(history.hasBlockers()).toBe(true)
    unblock()
    expect(history.hasBlockers()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  test('exposes a defensive blocker snapshot to host navigation', () => {
    const history = createNativeScriptHistory()
    const blocker = { blockerFn: vi.fn(() => false) }
    const unblock = history.block(blocker)
    const blockers = history.getBlockers()

    expect(blockers).toEqual([blocker])
    expect(blockers).not.toBe(history.getBlockers())

    unblock()
    expect(history.getBlockers()).toEqual([])
  })
})
