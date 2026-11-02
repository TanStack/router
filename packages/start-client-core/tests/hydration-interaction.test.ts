import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { interaction } from '../src/hydration/interaction'
import { getOrCreateGate, releaseGate } from '../src/hydration/runtime'

describe('interaction hydration replay', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.runAllTimers()
    document.body.replaceChildren()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function createMarker(id: string, parent: Element = document.body) {
    const marker = document.createElement('div')
    marker.setAttribute('data-ts-hydrate-id', id)
    marker.setAttribute('data-ts-hydrate-when', 'interaction')
    const button = document.createElement('button')
    marker.append(button)
    parent.append(marker)
    return { marker, button }
  }

  function createBoundary(id: string) {
    const { marker, button } = createMarker(id)
    const gate = getOrCreateGate(id, 'interaction')
    const resolve = vi.spyOn(gate, 'resolve').mockImplementation(() => {})
    const strategy = interaction({ events: 'click' })
    const cleanup = strategy._s?.({ element: marker, gate })
    cleanups.push(() => {
      cleanup?.()
      marker.remove()
      while (gate.consumers > 0) {
        releaseGate(gate, marker)
      }
    })
    return { marker, button, gate, strategy, cleanup, resolve }
  }

  it.each([false, true])(
    'discards queued clicks on final release (replay already scheduled: %s)',
    (scheduled) => {
      const { marker, button, gate, strategy, cleanup } =
        createBoundary('cancelled')
      button.click()

      cleanup?.()
      marker.remove()
      if (scheduled) {
        strategy._o?.('cancelled')
      }
      releaseGate(gate)

      const replay = vi.fn()
      button.addEventListener('click', replay)
      if (!scheduled) {
        strategy._o?.('cancelled')
      }
      vi.runAllTimers()

      expect(replay).not.toHaveBeenCalled()
    },
  )

  it('preserves queued clicks through strategy cleanup and replays them once', () => {
    const { marker, button, gate, strategy, cleanup, resolve } =
      createBoundary('successful')
    button.click()
    button.click()

    cleanup?.()
    resolve.mockRestore()
    gate.resolve()
    marker.removeAttribute('data-ts-hydrate-when')

    const replay = vi.fn()
    button.addEventListener('click', replay)
    strategy._o?.('successful')
    strategy._o?.('successful')
    vi.runAllTimers()

    expect(replay).toHaveBeenCalledTimes(2)
  })

  it('keeps queued clicks until the last consumer releases a shared gate', () => {
    const { marker, button, gate, strategy, cleanup, resolve } =
      createBoundary('shared')
    expect(getOrCreateGate('shared', 'interaction')).toBe(gate)
    button.click()
    releaseGate(gate, marker)

    cleanup?.()
    resolve.mockRestore()
    gate.resolve()
    marker.removeAttribute('data-ts-hydrate-when')
    const replay = vi.fn()
    button.addEventListener('click', replay)
    strategy._o?.('shared')
    vi.runAllTimers()

    expect(replay).toHaveBeenCalledOnce()
  })

  it('clears unregistered nested queues while preserving another boundary', () => {
    const outer = createBoundary('outer')
    const child = createMarker('child', outer.marker)
    const other = createBoundary('other')
    child.button.click()
    other.button.click()

    outer.cleanup?.()
    outer.marker.remove()
    releaseGate(outer.gate, outer.marker)
    const childReplay = vi.fn()
    child.button.addEventListener('click', childReplay)
    outer.strategy._o?.('outer')
    outer.strategy._o?.('child')

    other.cleanup?.()
    other.resolve.mockRestore()
    other.gate.resolve()
    other.marker.removeAttribute('data-ts-hydrate-when')
    const otherReplay = vi.fn()
    other.button.addEventListener('click', otherReplay)
    other.strategy._o?.('other')
    vi.runAllTimers()

    expect(childReplay).not.toHaveBeenCalled()
    expect(otherReplay).toHaveBeenCalledOnce()
  })

  it('does not clear a replacement gate when the old gate is released', () => {
    const oldGate = getOrCreateGate('replaced', 'visible')
    const { marker, button, gate, strategy, cleanup, resolve } =
      createBoundary('replaced')
    button.click()
    releaseGate(oldGate, marker)

    cleanup?.()
    resolve.mockRestore()
    gate.resolve()
    marker.removeAttribute('data-ts-hydrate-when')
    const replay = vi.fn()
    button.addEventListener('click', replay)
    strategy._o?.('replaced')
    vi.runAllTimers()

    expect(replay).toHaveBeenCalledOnce()
  })
})
