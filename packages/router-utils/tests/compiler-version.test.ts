import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compilerCacheKey } from '../src/compiler'

const roots: Array<string> = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

/** A package at `relative`, with one built script; returns its manifest. */
const pkg = (relative: string) => {
  const root = mkdtempSync(path.join(tmpdir(), 'compiler-version-'))
  roots.push(root)
  const dir = path.join(root, relative)
  mkdirSync(path.join(dir, 'dist/esm'), { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), '{"version":"1.0.0"}')
  writeFileSync(path.join(dir, 'dist/esm/a.js'), 'one')
  writeFileSync(path.join(dir, 'dist/esm/a.d.ts'), 'types')
  return path.join(dir, 'package.json')
}

describe('compilerCacheKey', () => {
  it('follows the version of an installed package, not its built scripts', () => {
    const manifest = pkg('node_modules/compiler')
    const before = compilerCacheKey([manifest])
    expect(compilerCacheKey([manifest])).toBe(before)
    writeFileSync(path.join(manifest, '../dist/esm/a.js'), 'two')
    expect(compilerCacheKey([manifest])).toBe(before)
    writeFileSync(manifest, '{"version":"1.0.1"}')
    expect(compilerCacheKey([manifest])).not.toBe(before)
  })

  it('follows the built scripts of a package outside node_modules', () => {
    const manifest = pkg('packages/compiler')
    const before = compilerCacheKey([manifest])
    writeFileSync(path.join(manifest, '../dist/esm/a.d.ts'), 'other types')
    expect(compilerCacheKey([manifest])).toBe(before)
    writeFileSync(path.join(manifest, '../dist/esm/a.js'), 'two')
    expect(compilerCacheKey([manifest])).not.toBe(before)
  })

  it('names which file holds which bytes', () => {
    const manifest = pkg('packages/compiler')
    const before = compilerCacheKey([manifest])
    rmSync(path.join(manifest, '../dist/esm/a.js'))
    writeFileSync(path.join(manifest, '../dist/esm/b.js'), 'one')
    expect(compilerCacheKey([manifest])).not.toBe(before)
  })
})
