import { describe, expect, it } from 'vitest'
import { resolveOutputDirectory } from '../src/vite/output-directory'

describe('resolveOutputDirectory', () => {
  it('resolves a relative output directory against the root', () => {
    expect(resolveOutputDirectory('/app', 'dist/client')).toBe(
      '/app/dist/client',
    )
  })

  it('keeps an absolute output directory', () => {
    expect(resolveOutputDirectory('/app', '/out/client')).toBe('/out/client')
  })

  it('keeps UNC paths intact', () => {
    expect(resolveOutputDirectory('/app', '//server/share/dist/server')).toBe(
      '//server/share/dist/server',
    )
    expect(resolveOutputDirectory('//server/share/app', 'dist')).toBe(
      '//server/share/app/dist',
    )
  })
})
