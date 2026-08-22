import { describe, expect, it } from 'vitest'
import {
  classifyBunChange,
  hmrEventForScope,
  rebuildScopeForChange,
  shouldRegenerateRoutes,
} from '../src/bun/hmr-protocol'
import { rewriteImportMetaHot } from '../src/bun/hmr-runtime'

describe('hmr-protocol', () => {
  const root = '/app'

  it('classifies route files', () => {
    expect(classifyBunChange(root, '/app/src/routes/index.tsx')).toBe('route')
  })

  it('classifies server-only files', () => {
    expect(classifyBunChange(root, '/app/src/db.server.ts')).toBe('server-only')
  })

  it('classifies client components', () => {
    expect(
      classifyBunChange(root, '/app/src/components/Button.tsx'),
    ).toBe('client')
  })

  it('maps scopes to SSE events', () => {
    expect(hmrEventForScope('server')).toBe('server-only')
    expect(hmrEventForScope('client')).toBe('client-reload')
    expect(hmrEventForScope('both')).toBe('full-reload')
  })

  it('rebuild scopes', () => {
    expect(rebuildScopeForChange('server-only')).toBe('server')
    expect(rebuildScopeForChange('client')).toBe('client')
    expect(rebuildScopeForChange('route')).toBe('both')
  })

  it('regenerates routes for route changes', () => {
    expect(shouldRegenerateRoutes('route')).toBe(true)
    expect(shouldRegenerateRoutes('server-only')).toBe(false)
  })
})

describe('rewriteImportMetaHot', () => {
  it('rewrites import.meta.hot to the Bun shim', () => {
    const input = `if (import.meta.hot) { import.meta.hot.accept(() => {}) }`
    const out = rewriteImportMetaHot(input)
    expect(out).toContain('__tanstack_import_meta_hot__')
    expect(out).toContain('globalThis.__tanstack_hot__?.(import.meta.url)')
    expect(out).not.toMatch(/(?<!__)import\.meta\.hot/)
  })

  it('keeps hot.data assignment valid', () => {
    const input = `import.meta.hot.data ??= {}`
    const out = rewriteImportMetaHot(input)
    expect(out).toContain('__tanstack_import_meta_hot__.data ??= {}')
    expect(out.split('\n').slice(1).join('\n')).not.toContain('?.(')
  })
})
