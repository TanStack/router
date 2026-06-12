import { describe, expect, it, vi } from 'vitest'
import { createNativeHistory } from '../src/history'

describe('createNativeHistory', () => {
  it('respects initialIndex 0', () => {
    const history = createNativeHistory({
      initialEntries: ['/first', '/second'],
      initialIndex: 0,
    })

    expect(history.location.pathname).toBe('/first')
    expect(history.canGoBack()).toBe(false)
  })

  it('exposes native back handling helpers', () => {
    const history = createNativeHistory({
      initialEntries: ['/first', '/second'],
    })
    const onNativeBack = vi.fn()

    history.setOnNativeBack(onNativeBack)
    history.handleNativeBack()

    expect(history.location.pathname).toBe('/first')
    expect(onNativeBack).toHaveBeenCalledTimes(1)
    expect(history.getStackDepth()).toBe(2)
    expect(history.getStackSnapshot()).toMatchObject([
      { index: 0, path: '/first' },
      { index: 1, path: '/second' },
    ])
  })
})
