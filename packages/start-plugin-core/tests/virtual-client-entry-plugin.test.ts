import { describe, expect, test } from 'vitest'
import { ENTRY_POINTS } from '../src/constants'
import { createVirtualClientEntryPlugin } from '../src/vite/plugins'

describe('createVirtualClientEntryPlugin', () => {
  test('resolves the virtual client entry id', () => {
    const plugin = createVirtualClientEntryPlugin({
      getClientEntry: () => '/repo/src/client.tsx',
    })

    expect((plugin as any).resolveId.handler(ENTRY_POINTS.client)).toBe(
      '\0virtual:tanstack-start-client-entry',
    )
  })

  test('loads a normalized import for the client entry file', () => {
    const plugin = createVirtualClientEntryPlugin({
      getClientEntry: () => 'C:\\repo\\src\\client.tsx',
    })

    expect(
      (plugin as any).load.handler('\0virtual:tanstack-start-client-entry'),
    ).toBe('import "C:/repo/src/client.tsx"')
  })
})
