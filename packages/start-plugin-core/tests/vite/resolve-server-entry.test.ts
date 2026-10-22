import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, test } from 'vitest'
import { join } from 'pathe'
import { resolveServerEntry } from '../../src/vite/preview-server-plugin/resolve-server-entry'
import type { BuildEnvironmentOptions } from 'vite'

const tempDirs: Array<string> = []

function makeServerDir(files: Array<string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tss-server-entry-'))
  tempDirs.push(dir)
  for (const file of files) {
    writeFileSync(join(dir, file), 'export default {}')
  }
  return dir
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('resolveServerEntry', () => {
  test('resolves the default `<input>.js` entry', () => {
    const dir = makeServerDir(['server.js'])
    expect(resolveServerEntry(undefined, dir)).toBe(join(dir, 'server.js'))
  })

  test('resolves an entry renamed via output.entryFileNames', () => {
    const dir = makeServerDir(['index.mjs'])
    const build: BuildEnvironmentOptions = {
      rollupOptions: {
        input: 'server',
        output: { entryFileNames: 'index.mjs' },
      },
    }
    expect(resolveServerEntry(build, dir)).toBe(join(dir, 'index.mjs'))
  })

  test('resolves the `[name]` placeholder in entryFileNames', () => {
    const dir = makeServerDir(['server.mjs'])
    const build: BuildEnvironmentOptions = {
      rollupOptions: { output: { entryFileNames: '[name].mjs' } },
    }
    expect(resolveServerEntry(build, dir)).toBe(join(dir, 'server.mjs'))
  })

  test('falls back to alternate extensions when no output name is configured', () => {
    const dir = makeServerDir(['server.mjs'])
    expect(resolveServerEntry(undefined, dir)).toBe(join(dir, 'server.mjs'))
  })

  test('throws a diagnostic error naming candidates and present files', () => {
    const dir = makeServerDir(['index.mjs', 'wrangler.json'])
    expect(() => resolveServerEntry(undefined, dir)).toThrow(
      /Could not find the server entry/,
    )
    // Names a filename it looked for and a file that is actually present.
    expect(() => resolveServerEntry(undefined, dir)).toThrow(/server\.js/)
    expect(() => resolveServerEntry(undefined, dir)).toThrow(/index\.mjs/)
  })

  test('throws when the server input is not a string', () => {
    const build: BuildEnvironmentOptions = {
      rollupOptions: { input: { app: 'src/server.ts' } },
    }
    expect(() => resolveServerEntry(build, tmpdir())).toThrow(
      /Invalid server input/,
    )
  })
})
