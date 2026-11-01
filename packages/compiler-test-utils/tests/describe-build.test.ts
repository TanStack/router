/**
 * Controls of `describeBuild` (build-harness.ts) on an output written to
 * disk: a bundler may emit a chunk without
 * a source map file next to chunks that have one. The description reads the
 * maps that exist and leaves the others unset, so that whether a map is
 * required stays the test's question; a map file that is not a map still
 * fails.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, onTestFinished, test } from 'vitest'
import { describeBuild } from '../src/build-harness'

async function output(files: Record<string, string>) {
  const outDir = await mkdtemp(path.join(tmpdir(), 'describe-build-'))
  onTestFinished(() => rm(outDir, { recursive: true, force: true }))
  for (const [file, content] of Object.entries(files)) {
    await writeFile(path.join(outDir, file), content)
  }
  return outDir
}

const map = JSON.stringify({
  version: 3,
  sources: ['../src/entry.ts'],
  names: [],
  mappings: 'AAAA',
})

const describe = (outDir: string) =>
  describeBuild({
    bundler: 'vite',
    env: 'ssr',
    mode: 'production',
    root: outDir,
    outDir,
    chunks: [
      {
        fileName: 'entry.js',
        isEntry: true,
        imports: [],
        dynamicImports: ['lazy.js'],
      },
      { fileName: 'lazy.js', isEntry: false, imports: [], dynamicImports: [] },
    ],
    sourcemap: true,
    warnings: [],
    consoleMessages: [],
    dispose: async () => {},
  })

test('a chunk without a source map file is described without a map, next to one with its map', async () => {
  const outDir = await output({
    'entry.js': `export const load = () => import('./lazy.js')\n`,
    'entry.js.map': map,
    'lazy.js': `export const lazy = 1\n`,
  })
  const described = await describe(outDir)
  const byName = Object.fromEntries(
    described.chunks.map((chunk) => [chunk.fileName, chunk]),
  )
  expect(byName['entry.js']!.map?.sources).toEqual(['../src/entry.ts'])
  expect(byName['lazy.js']!.map).toBeUndefined()
  expect(described.lazy).toEqual(['lazy.js'])
})

test('a source map file that is not a map still fails the description', async () => {
  const outDir = await output({
    'entry.js': `export const load = () => import('./lazy.js')\n`,
    'entry.js.map': map,
    'lazy.js': `export const lazy = 1\n`,
    'lazy.js.map': '{ not json',
  })
  await expect(describe(outDir)).rejects.toThrow(SyntaxError)
})
