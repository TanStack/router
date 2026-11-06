import { describe, expect, test } from 'vitest'
import { mayHaveReResolvedImports } from '../../src/rsbuild/rebuilt-modules'
import type { Rspack } from '@rsbuild/core'

function check(options: {
  modified?: Array<string>
  removed?: Array<string>
  rebuilt?: Array<string>
  contextDependencies?: Array<string>
}) {
  return mayHaveReResolvedImports(
    {
      modifiedFiles: new Set(options.modified ?? []),
      removedFiles: new Set(options.removed ?? []),
    } as unknown as Rspack.Compiler,
    {
      builtModules: new Set(
        (options.rebuilt ?? []).map((path) => ({
          resourceResolveData: { path },
        })),
      ),
      contextDependencies: new Set(options.contextDependencies ?? []),
    } as unknown as Rspack.Compilation,
  )
}

describe('mayHaveReResolvedImports', () => {
  test('is false when every changed file was rebuilt', () => {
    expect(
      check({ modified: ['/app/src/a.ts'], rebuilt: ['/app/src/a.ts'] }),
    ).toBe(false)
  })

  test('ignores watched directories that changed with a rebuilt file', () => {
    expect(
      check({
        modified: ['/app/src/a.ts', '/app/src'],
        rebuilt: ['/app/src/a.ts', '/app/src/styles.css'],
        contextDependencies: ['/app/src'],
      }),
    ).toBe(false)
  })

  test.each([
    { modified: ['/app/src/new-entry.ts'], rebuilt: [] },
    { modified: ['/app/package.json'], rebuilt: [] },
    { modified: ['/app/package.json'], rebuilt: ['/app/package.json'] },
    { modified: ['/app/tsconfig.app.json'], rebuilt: [] },
    { removed: ['/app/src/a.ts'], rebuilt: [] },
  ])('is true for $modified $removed', (options) => {
    expect(check(options)).toBe(true)
  })
})
