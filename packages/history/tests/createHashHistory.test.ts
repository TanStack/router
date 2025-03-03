import { describe, expect, test } from 'vitest'

import { createHashHistory } from '../src'

describe('createHashHistory', () => {
  test('parseLocation', () => {
    const history = createHashHistory()
    window.history.pushState({}, '', '/')
    expect(history.location.pathname).toBe('/')
    expect(history.location.search).toBe('')
    window.history.pushState({}, '', '/#hello')
    expect(history.location.pathname).toBe('/hello')
    expect(history.location.search).toBe('')
    window.history.pushState({}, '', '/?search=params')
    expect(history.location.pathname).toBe('/')
    expect(history.location.search).toBe('?search=params')
    window.history.pushState({}, '', '/#hello?search=params')
    expect(history.location.pathname).toBe('/hello')
    expect(history.location.search).toBe('?search=params')
    window.history.pushState({}, '', '/?search=params#hello')
    expect(history.location.pathname).toBe('/hello')
    expect(history.location.search).toBe('?search=params')
  })
})
