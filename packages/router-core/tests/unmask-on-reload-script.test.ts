import { describe, expect, test } from 'vitest'
import { getUnmaskOnReloadScript } from '../src'

describe('getUnmaskOnReloadScript', () => {
  test('returns null when no route mask sources are provided', () => {
    expect(getUnmaskOnReloadScript([])).toBeNull()
  })

  test('serializes the inline unmask-on-reload script', () => {
    const script = getUnmaskOnReloadScript(['^/modal$'])

    expect(script).toContain('window.history.state?.__tempLocation')
    expect(script).toContain('window.location.replace')
    expect(script).toContain('"routeMaskSources":["^/modal$"]')
  })
})
