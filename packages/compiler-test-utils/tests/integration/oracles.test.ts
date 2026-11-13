/**
 * The diagnostic and source-map oracles on real bundler output: every
 * bundler's build error for a broken module names the file and its line
 * (whatever the bundler's format), and a throw executed in a built,
 * source-mapped chunk resolves through its stack to the line of the throw.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { bundleApp as bundleAppIn, bundlers } from '../../src/build-harness'
import {
  captureThrow,
  expectDiagnostic,
  mentionsFile,
} from '../../src/diagnostics'
import { traceStack } from '../../src/source-maps'
import type { BundleOptions } from '../../src/build-harness'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

function bundleApp(options: Omit<BundleOptions, 'dir'>) {
  return bundleAppIn({
    dir: testsDir,
    registerCleanup: onTestFinished,
    ...options,
  })
}

// One unexpected token, so every parser reports the same position: line 2,
// column 26 (1-based), the `*`.
const broken = `export const ok = 1
export const value = 1 + * 2
export const after = 3
`

const failing = `interface Failure {
  message: string
}
type Reason = Failure['message']
export function fail(reason: Reason = 'MARK_FAIL'): string {
  throw new Error(reason)
}
`

describe.each(bundlers)('%s', (bundler) => {
  test(
    'a build error names the broken file and its line',
    async () => {
      const diagnostics = await captureThrow(() =>
        bundleApp({
          bundler,
          files: {
            'entry.ts': `export { value } from './src/broken'\n`,
            'src/broken.ts': broken,
          },
        }),
      )
      expectDiagnostic(diagnostics, {
        severity: 'error',
        file: 'src/broken.ts',
        position: { line: 2, column: 26 },
      })
    },
    timeout,
  )

  test(
    'a throw in a built chunk resolves through its stack to the line of the throw',
    async () => {
      const app = await bundleApp({
        bundler,
        files: {
          'entry.ts': `export async function load() {
  const { fail } = await import('./src/failing')
  return fail()
}
`,
          'src/failing.ts': failing,
        },
        sourcemap: true,
      })
      const { result: stack } = await app.run(
        `try { await entry.load() } catch (error) { return error.stack }`,
      )
      expect(stack).toContain('MARK_FAIL')
      const frames = traceStack(stack as string, (location) => {
        const file = location.startsWith('file:')
          ? fileURLToPath(location)
          : location
        return app.chunks.find(
          (chunk) => path.join(app.outDir, chunk.fileName) === file,
        )?.map as never
      })
      const resolved = frames.find((frame) => frame.original)
      expect(resolved?.original?.line).toBe(6)
      expect(mentionsFile(resolved!.original!.source, 'src/failing.ts')).toBe(
        true,
      )
    },
    timeout,
  )
})
