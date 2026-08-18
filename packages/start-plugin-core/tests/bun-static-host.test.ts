import { describe, expect, it } from 'vitest'
import {
  generateHostEntrySource,
  resolveClientAssetPath,
} from '../src/bun/static-host'

describe('resolveClientAssetPath', () => {
  const clientOutDir = '/app/dist/client'

  it('maps /assets/... paths', () => {
    expect(resolveClientAssetPath(clientOutDir, '/assets/app.css')).toBe(
      '/app/dist/client/assets/app.css',
    )
  })

  it('maps extensioned paths outside assets', () => {
    expect(resolveClientAssetPath(clientOutDir, '/favicon.ico')).toBe(
      '/app/dist/client/favicon.ico',
    )
  })

  it('rejects traversal and plain routes', () => {
    expect(resolveClientAssetPath(clientOutDir, '/../etc/passwd')).toBeNull()
    expect(resolveClientAssetPath(clientOutDir, '/assets/../../x')).toBeNull()
    expect(resolveClientAssetPath(clientOutDir, '/login')).toBeNull()
  })
})

describe('generateHostEntrySource', () => {
  it('emits a Bun.serve host that loads server.js', () => {
    const source = generateHostEntrySource()
    expect(source).toContain('server.js')
    expect(source).toContain('Bun.serve')
    expect(source).toContain('formatListenBanner')
    expect(source).toContain('networkInterfaces')
  })
})
