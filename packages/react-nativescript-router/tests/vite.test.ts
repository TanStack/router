import { describe, expect, test } from 'vitest'
import { tanstackReactNativeScript } from '../src/vite'
import type { UserConfig } from 'vite'

describe('tanstackReactNativeScript', () => {
  test('disables browser module preload handling', () => {
    const plugin = tanstackReactNativeScript()
    const config = (plugin.config as () => UserConfig)()

    expect(config.build?.modulePreload).toBe(false)
  })
})
