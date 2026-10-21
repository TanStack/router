/**
 * Controls of `getModuleErrors` with real-build evidence (validate-module.ts
 * `build`; SPEC G8, RULES-AUDIT R11, N19): the per-module approximation keeps
 * every export, so it reports a dangling read in an export the real graph
 * drops; with the real build, only what the build still ships counts.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { bundleApp } from '../../src/build-harness'
import { getModuleErrors } from '../../src/validate-module'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const module = `export const used = () => 'MARK_USED'
export const unused = () => danglingName
`

async function build(entry: string) {
  return bundleApp({
    dir: testsDir,
    registerCleanup: onTestFinished,
    bundler: 'vite',
    env: 'ssr',
    sourcemap: true,
    files: { 'entry.ts': entry, 'mod.ts': module },
  })
}

test(
  'a dangling read in an export the real build drops is no error with the build; one it ships is',
  async () => {
    // Without the build: the approximation keeps `unused`
    expect(await getModuleErrors(module, 'mod.ts')).toEqual([
      '`danglingName` is referenced but never declared or imported',
    ])

    const dropped = await build(
      `import { used } from './mod'\nexport const read = () => used()\n`,
    )
    expect(dropped.where('MARK_USED')).toBe('eager')
    expect(
      await getModuleErrors(module, 'mod.ts', {
        build: {
          chunks: dropped.chunks,
          outDir: dropped.outDir,
          module: path.join(dropped.root, 'mod.ts'),
        },
      }),
    ).toEqual([])

    const shipped = await build(
      `import { used, unused } from './mod'\nexport const read = () => [used(), unused]\n`,
    )
    expect(
      await getModuleErrors(module, 'mod.ts', {
        build: {
          chunks: shipped.chunks,
          outDir: shipped.outDir,
          module: path.join(shipped.root, 'mod.ts'),
        },
      }),
    ).toEqual(['`danglingName` is referenced but never declared or imported'])
  },
  timeout,
)
