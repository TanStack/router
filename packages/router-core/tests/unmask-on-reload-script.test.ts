import { describe, expect, test } from 'vitest'
import {
  getUnmaskOnReloadScript,
  getUnmaskOnReloadScriptFromRouteMasks,
} from '../src'

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

describe('getUnmaskOnReloadScriptFromRouteMasks', () => {
  test('serializes unmask-on-reload route masks into the inline script', () => {
    const script = getUnmaskOnReloadScriptFromRouteMasks([
      { from: '/modal', unmaskOnReload: true },
      { from: '/ignored', unmaskOnReload: false },
    ])

    expect(script).toContain('window.history.state?.__tempLocation')
    expect(script).toContain('window.location.replace')
    expect(script).toContain('"routeMaskSources":["^/modal$"]')
    expect(script).not.toContain('/ignored')
  })

  test('returns null when no route masks opt into unmask-on-reload', () => {
    expect(
      getUnmaskOnReloadScriptFromRouteMasks([
        { from: '/modal', unmaskOnReload: false },
      ]),
    ).toBeNull()
  })
})
