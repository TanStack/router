import { describe, expect, test } from 'vitest'
import { DEV_CLIENT_ENTRY } from '../src/constants'
import { createDevClientEntryPlugin } from '../src/vite/plugins'

describe('createDevClientEntryPlugin', () => {
  test('resolves the dev client entry id', () => {
    const plugin = createDevClientEntryPlugin({
      framework: 'solid',
      getClientEntry: () => '/repo/src/client.tsx',
    })

    expect((plugin as any).resolveId.handler(DEV_CLIENT_ENTRY)).toBe(
      '\0virtual:tanstack-start-dev-client-entry',
    )
  })

  test('loads a normalized import for the client entry file', async () => {
    const plugin = createDevClientEntryPlugin({
      framework: 'solid',
      getClientEntry: () => 'C:\\repo\\src\\client.tsx',
    })

    expect(
      await (plugin as any).load.handler(
        '\0virtual:tanstack-start-dev-client-entry',
      ),
    ).toBe('import "C:/repo/src/client.tsx"')
  })

  test('injects React refresh preamble before React dev client entry', async () => {
    const plugin = createDevClientEntryPlugin({
      framework: 'react',
      getClientEntry: () => '/repo/src/client.tsx',
    })

    const code = await (plugin as any).load.handler.call(
      {
        environment: {
          config: {
            base: '/base/',
            command: 'serve',
            consumer: 'client',
            server: {},
          },
        },
        resolve: async (id: string) =>
          id === '/@react-refresh' ? { id } : null,
      },
      '\0virtual:tanstack-start-dev-client-entry',
    )

    expect(code).toContain(
      'import { injectIntoGlobalHook } from "/@react-refresh"',
    )
    expect(code).toContain('injectIntoGlobalHook(window)')
    expect(code).toContain(
      'window.__vite_plugin_react_preamble_installed__ = true',
    )
    expect(code).toContain('await import("/repo/src/client.tsx")')
  })

  test('skips React refresh preamble when Vite HMR is disabled', async () => {
    const plugin = createDevClientEntryPlugin({
      framework: 'react',
      getClientEntry: () => '/repo/src/client.tsx',
    })

    const code = await (plugin as any).load.handler.call(
      {
        environment: {
          config: {
            command: 'serve',
            consumer: 'client',
            server: {
              hmr: false,
            },
          },
        },
        resolve: async () => null,
      },
      '\0virtual:tanstack-start-dev-client-entry',
    )

    expect(code).toBe('import "/repo/src/client.tsx"')
  })

  test('throws a setup error when React refresh cannot be resolved', async () => {
    const plugin = createDevClientEntryPlugin({
      framework: 'react',
      getClientEntry: () => '/repo/src/client.tsx',
    })

    await expect(
      (plugin as any).load.handler.call(
        {
          environment: {
            config: {
              command: 'serve',
              consumer: 'client',
              server: {},
            },
          },
          resolve: async () => null,
        },
        '\0virtual:tanstack-start-dev-client-entry',
      ),
    ).rejects.toThrow('/@react-refresh could not be resolved')
  })
})
