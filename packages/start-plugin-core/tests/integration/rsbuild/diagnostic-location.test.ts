/**
 * A Start compile error or warning on Rsbuild names its position as the
 * compilation's own location (SPEC G5, §5.7): Rsbuild prints the file and
 * the location of a compilation error or warning (`File: ./src/fns.ts:3:5`,
 * in the terminal and the overlay) from its stats' `moduleName` and `loc`,
 * and `:1:1` when there is no `loc`. Columns are 1-based, as in the message.
 */
import { describe, expect, test } from 'vitest'
import { diagnosticPosition } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart } from '../../build-harness'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import type { RsbuildPlugin } from '@rsbuild/core'

const timeout = 60_000

interface Located {
  severity: 'error' | 'warning'
  moduleName?: string
  loc?: string
  message: string
}

/** Every compilation's errors and warnings, as Rsbuild reads them to print them. */
function recordLocations(): { plugin: RsbuildPlugin; seen: Array<Located> } {
  const seen: Array<Located> = []
  return {
    seen,
    plugin: {
      name: 'test:diagnostic-locations',
      setup(api) {
        api.onAfterEnvironmentCompile(({ stats }) => {
          const json = stats?.toJson({
            all: false,
            errors: true,
            warnings: true,
          })
          for (const severity of ['error', 'warning'] as const) {
            for (const entry of json?.[`${severity}s`] ?? []) {
              seen.push({
                severity,
                moduleName: entry.moduleName,
                loc: entry.loc,
                message: entry.message,
              })
            }
          }
        })
      },
    },
  }
}

/** The location Rsbuild would print for `file`'s Start diagnostics. */
function locationsOf(seen: Array<Located>, file: string, marker: RegExp) {
  return seen
    .filter(
      (entry) =>
        entry.moduleName?.replace(/^\.\//, '') === file &&
        marker.test(entry.message),
    )
    .map(({ severity, loc }) => ({ severity, loc }))
}

const escapingSource = `import { createServerFn } from '@tanstack/react-start'
import { wrap } from './wrap'
export const reveal = wrap(createServerFn()).handler(async () => 'MARK_SERVER_SECRET')
`
const wrapSource = `export function wrap(builder: any) {
  return Object.assign(builder, {})
}
`
const serverParamSource = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`

const at = (source: string, needle: string) => {
  const { line, column } = diagnosticPosition(source, needle)
  return `${line}:${column}`
}

describe('rsbuild build', () => {
  test(
    'a compile error is located at its position',
    async () => {
      const { plugin, seen } = recordLocations()
      await expect(
        buildStart({
          bundler: 'rsbuild',
          files: {
            'src/wrap.ts': wrapSource,
            'src/fns.ts': escapingSource,
            'src/entry.ts': `export { reveal } from './fns'\n`,
          },
          entry: 'src/entry.ts',
          rsbuildConfig: { plugins: [plugin] },
        }),
      ).rejects.toBeInstanceOf(StartBuildError)
      expect(locationsOf(seen, 'src/fns.ts', /createServerFn|builder/)).toEqual(
        [{ severity: 'error', loc: at(escapingSource, 'createServerFn())') }],
      )
    },
    timeout,
  )

  test(
    'a compile warning is located at its position',
    async () => {
      const { plugin, seen } = recordLocations()
      await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/role.ts': serverParamSource,
          'src/entry.ts': `export { requireRole } from './role'\n`,
        },
        entry: 'src/entry.ts',
        rsbuildConfig: { plugins: [plugin] },
      })
      const located = locationsOf(seen, 'src/role.ts', /`role`/)
      expect(located).not.toEqual([])
      expect(located).toEqual(
        located.map(() => ({
          severity: 'warning',
          loc: at(serverParamSource, 'role: string'),
        })),
      )
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  test(
    'a compile error and a warning are located at their positions',
    async () => {
      const { plugin, seen } = recordLocations()
      await startRsbuildStartDevServer({
        files: {
          'src/wrap.ts': wrapSource,
          'src/fns.ts': escapingSource,
          'src/role.ts': serverParamSource,
          'src/entry.ts': `export { reveal } from './fns'
export { requireRole } from './role'
`,
        },
        config: { plugins: [plugin] },
      })
      expect(
        locationsOf(seen, 'src/fns.ts', /createServerFn|builder/).filter(
          ({ severity }) => severity === 'error',
        ),
      ).toContainEqual({
        severity: 'error',
        loc: at(escapingSource, 'createServerFn())'),
      })
      const warnings = locationsOf(seen, 'src/role.ts', /`role`/)
      expect(warnings).not.toEqual([])
      expect(warnings).toEqual(
        warnings.map(() => ({
          severity: 'warning',
          loc: at(serverParamSource, 'role: string'),
        })),
      )
    },
    timeout,
  )
})
