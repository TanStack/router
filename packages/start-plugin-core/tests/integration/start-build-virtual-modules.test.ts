/**
 * A Vite plugin's virtual modules (`virtual:…`) in a build. The compiler reads
 * such a module's text through the bundler, which hands it over once the
 * module's transforms are done: a compile among those transforms that waits
 * for that text (a marked virtual module's own, two virtual modules importing
 * each other) cannot finish. The build fails then, at once, instead of
 * hanging (SPEC G5); other virtual modules build.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart } from '../build-harness'
import type { StartBuild } from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 60_000

/** How long a build may take before the test calls it hung. */
const hung = 30_000

const virtualModules = (modules: Record<string, string>): Plugin => ({
  name: 'test:virtual-modules',
  resolveId(id) {
    return id in modules ? id : null
  },
  load(id) {
    return modules[id] ?? null
  },
})

/** The build's outcome: built, failed (with its diagnostics) or hung. */
const build = async (
  entry: string,
  modules: Record<string, string>,
): Promise<
  | { outcome: 'built'; build: StartBuild }
  | { outcome: 'failed'; error: StartBuildError }
  | { outcome: 'hung' }
> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      buildStart({
        bundler: 'vite',
        files: { 'src/entry.ts': entry },
        entry: 'src/entry.ts',
        viteConfig: { plugins: [virtualModules(modules)] },
      }).then(
        (b) => ({ outcome: 'built' as const, build: b }),
        (error: unknown) => {
          if (!(error instanceof StartBuildError)) {
            throw error
          }
          return { outcome: 'failed' as const, error }
        },
      ),
      new Promise<{ outcome: 'hung' }>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: 'hung' }), hung)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_SERVER_SECRET'
`

describe.each(['virtual:app', 'virtual:app.ts'])('%s', (id) => {
  const other = id.replace('app', 'other')

  test(
    'a marked virtual module a client module imports fails the build',
    async () => {
      const result = await build(
        `import { secret } from '${id}'\nexport const value = () => secret()\n`,
        { [id]: marked },
      )
      expect(result.outcome).toBe('failed')
      if (result.outcome === 'failed') {
        expectDiagnostic(result.error.diagnostics, { severity: 'error' })
      }
    },
    timeout,
  )

  test(
    'virtual modules importing each other fail the build',
    async () => {
      const result = await build(
        `import { a } from '${id}'\nexport const value = () => a()\nconsole.log('MARK_ENTRY', value)\n`,
        {
          [id]: `import { b } from '${other}'\nexport const a = () => b\n`,
          [other]: `import { a } from '${id}'\nexport const b = () => ['MARK_OTHER', a]\n`,
        },
      )
      expect(result.outcome).toBe('failed')
      if (result.outcome === 'failed') {
        expectDiagnostic(result.error.diagnostics, { severity: 'error' })
      }
    },
    timeout,
  )

  test(
    'a virtual module importing another builds',
    async () => {
      const result = await build(
        `import { a } from '${id}'\nexport const value = () => a()\nconsole.log('MARK_ENTRY', value)\n`,
        {
          [id]: `import { b } from '${other}'\nexport const a = () => b\n`,
          [other]: `export const b = () => 'MARK_OTHER'\n`,
        },
      )
      expect(result.outcome).toBe('built')
      if (result.outcome === 'built') {
        expect(result.build.client.where('MARK_OTHER')).not.toBe('nowhere')
      }
    },
    timeout,
  )
})
