import { describe, expect, test } from 'vitest'
import { tanstackReactNativeScript } from '../src/vite'
import type { UserConfig } from 'vite'

describe('tanstackReactNativeScript', () => {
  test('disables browser module preload handling', () => {
    const plugin = tanstackReactNativeScript()
    const config = (plugin.config as () => UserConfig)()

    expect(config.build?.modulePreload).toBe(false)
  })

  test('leaves React to the NativeScript HMR dev server', () => {
    const plugin = tanstackReactNativeScript()
    const config = (
      plugin.config as (
        config: UserConfig,
        env: { command: string },
      ) => UserConfig
    )({}, { command: 'serve' })
    const aliases = (config.resolve?.alias ?? []) as unknown as Array<{
      find: RegExp
    }>

    expect(aliases.map((alias) => String(alias.find))).toEqual([
      '/^react-dom$/',
    ])
  })
})
