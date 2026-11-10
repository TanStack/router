/**
 * What a modified file an Rsbuild environment's compiler is told about is:
 * an edit, a creation (which re-resolves the imports that failed to resolve
 * before), or nothing (a directory a compilation watched). A file is created
 * only when no environment's last compilation depended on it: under RSC,
 * Rspack's coordinator tells the client compiler about the server's changed
 * files, which the client's own compilation never read (review round 3,
 * R3-G5-2; ruling F1: tested through the session's own record, no timed dev
 * servers).
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { CompilationFiles } from '../../src/rsbuild/compiler-session'

const file = (...parts: Array<string>) => path.join('/app', 'src', ...parts)

describe('a file event of an Rsbuild environment', () => {
  test('before the environment compiled, a modified file is an edit', () => {
    const files = new CompilationFiles()
    files.record('ssr', [file('Posts.tsx')], [])
    expect(files.eventOf('client', file('Other.tsx'))).toBe('change')
  })

  test('a file only another environment depended on is an edit, not a creation', () => {
    const files = new CompilationFiles()
    files.record('ssr', [file('Posts.tsx')], [])
    files.record('client', [file('client.tsx')], [])
    expect(files.eventOf('client', file('Posts.tsx'))).toBe('change')
    expect(files.eventOf('ssr', file('client.tsx'))).toBe('change')
  })

  test('a file no environment depended on was created', () => {
    const files = new CompilationFiles()
    files.record('ssr', [file('Posts.tsx')], [])
    files.record('client', [file('client.tsx')], [])
    expect(files.eventOf('client', file('New.tsx'))).toBe('add')
  })

  test('a directory a compilation watched is no file event', () => {
    const files = new CompilationFiles()
    files.record('client', [file('client.tsx')], [file('styles')])
    files.record('ssr', [], [])
    expect(files.eventOf('client', file('styles'))).toBe(null)
    expect(files.eventOf('ssr', file('styles'))).toBe(null)
  })

  test('a compilation replaces what the environment depended on', () => {
    const files = new CompilationFiles()
    files.record('client', [file('Old.tsx')], [])
    files.record('client', [file('client.tsx')], [])
    expect(files.eventOf('client', file('Old.tsx'))).toBe('add')
  })
})
