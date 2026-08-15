import { describe, expect, it } from 'vitest'
import { buildStandaloneEntrySource } from '../src/bun/standalone-compile'

describe('buildStandaloneEntrySource', () => {
  it('embeds client assets with file imports', () => {
    const source = buildStandaloneEntrySource({
      entryPath: '/app/dist/server/.standalone-entry.js',
      clientOutDir: '/app/dist/client',
      assetFiles: [
        '/app/dist/client/index.html',
        '/app/dist/client/assets/app.js',
      ],
    })
    expect(source).toContain('with { type: "file" }')
    expect(source).toContain('/assets/app.js')
    expect(source).toContain('Bun.serve')
    expect(source).toContain('./server.js')
  })

  it('prefixes asset keys with publicBase', () => {
    const source = buildStandaloneEntrySource({
      entryPath: '/app/dist/server/.standalone-entry.js',
      clientOutDir: '/app/dist/client',
      publicBase: '/app/',
      assetFiles: ['/app/dist/client/assets/app.js'],
    })
    expect(source).toContain('/app/assets/app.js')
  })
})
