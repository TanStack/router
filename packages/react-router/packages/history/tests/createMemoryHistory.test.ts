import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '../src'

describe('createMemoryHistory', () => {
  test('back', () => {
    const initialEntry = '/initial'
    const history = createMemoryHistory({ initialEntries: [initialEntry] })
    history.push('/a')
    history.push('/b')
    history.push('/c')
    history.back()
    expect(history.location.pathname).toBe('/b')
    history.back()
    expect(history.location.pathname).toBe('/a')
    history.back()
    expect(history.location.pathname).toBe(initialEntry)
    // check that back does nothing when there is no back history
    history.back()
    expect(history.location.pathname).toBe(initialEntry)
  })

  test('forward', () => {
    const history = createMemoryHistory()
    history.push('/a')
    history.push('/b')
    history.push('/c')
    history.back()
    history.back()
    expect(history.location.pathname).toBe('/a')
    history.forward()
    expect(history.location.pathname).toBe('/b')
    history.forward()
    expect(history.location.pathname).toBe('/c')
    // check that forward does nothing when there is no forward history
    history.forward()
    expect(history.location.pathname).toBe('/c')
  })

  test('push and back #1916', () => {
    const history = createMemoryHistory()
    history.push('/a')
    expect(history.location.pathname).toBe('/a')
    history.push('/b')
    expect(history.location.pathname).toBe('/b')
    history.push('/c')
    expect(history.location.pathname).toBe('/c')
    history.back()
    expect(history.location.pathname).toBe('/b')
    history.push('/d')
    expect(history.location.pathname).toBe('/d')
    history.back()
    expect(history.location.pathname).toBe('/b')
  })

  test('length', () => {
    const history = createMemoryHistory()
    expect(history.length).toBe(1)
    history.push('/a')
    expect(history.length).toBe(2)
    history.replace('/b')
    expect(history.length).toBe(2)
    history.back()
    expect(history.length).toBe(2)
    history.push('/c')
    expect(history.length).toBe(2)
  })

  test('state', () => {
    const history = createMemoryHistory()
    history.push('/a', { i: 1 })
    expect((history.location.state as any).i).toBe(1)
    history.replace('/b', { i: 2 })
    expect((history.location.state as any).i).toBe(2)
    history.back()
    expect((history.location.state as any).i).toBeUndefined()
    history.push('/c', { i: 3 })
    expect((history.location.state as any).i).toBe(3)
  })
})
