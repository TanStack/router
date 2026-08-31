import { describe, expect, it, vi } from 'vitest'
import { createBunImportProtectionPlugin } from '../src/bun/import-protection'

describe('createBunImportProtectionPlugin', () => {
  it('creates a named Bun plugin', () => {
    const plugin = createBunImportProtectionPlugin({
      envName: 'client',
      envType: 'client',
      root: '/app',
      srcDirectory: 'src',
      mode: 'build',
    })
    expect(plugin.name).toBe('tanstack-start-import-protection:client')
    expect(typeof plugin.setup).toBe('function')
  })

  it('registers onLoad and mock resolve handlers', () => {
    const plugin = createBunImportProtectionPlugin({
      envName: 'ssr',
      envType: 'server',
      root: '/app',
      srcDirectory: 'src',
      mode: 'dev',
      importProtection: { behavior: 'mock' },
    })

    const onLoad = vi.fn()
    const onResolve = vi.fn()
    plugin.setup({
      onLoad,
      onResolve,
      onStart() {},
      onBeforeParse() {},
      onEnd() {},
      module: () => ({}),
    } as any)

    expect(onLoad).toHaveBeenCalled()
    expect(onResolve).toHaveBeenCalled()
  })
})
