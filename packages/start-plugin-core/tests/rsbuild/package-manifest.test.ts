import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { isPackageManifest } from '../../src/rsbuild/host-plugin'

describe('package.json edits Rspack reports', () => {
  test.each([
    ['POSIX', path.posix.join('/app', 'node_modules', 'pkg', 'package.json')],
    [
      'Windows',
      path.win32.join('C:\\app', 'node_modules', 'pkg', 'package.json'),
    ],
  ])('a %s path to a package.json is one', (_, file) => {
    expect(isPackageManifest(file)).toBe(true)
  })

  test.each([
    ['POSIX', path.posix.join('/app', 'src', 'my-package.json')],
    ['Windows', path.win32.join('C:\\app', 'src', 'my-package.json')],
    ['Windows', path.win32.join('C:\\app', 'src', 'route.tsx')],
  ])('a %s path to another file is not one', (_, file) => {
    expect(isPackageManifest(file)).toBe(false)
  })
})
