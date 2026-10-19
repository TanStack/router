/**
 * A standalone route file named like a route group (`(group).tsx`): route
 * groups are documented as directories only (routing/routing-concepts.md
 * :627-643, routing/file-naming-conventions.md:15), so this form is
 * undocumented and must never fail silently (SPEC §2.2): a failed run or a
 * warning naming the file (the run then still gives a route tree the
 * router loads). No channel is required. Route group directories are tested
 * in real-router.test.ts and route-paths.test.ts.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'

import { Generator, getConfig } from '../src'
import { routesOf } from './route-tree'

function makeFolderDir(folder: string) {
  return join(process.cwd(), 'tests', 'deny-route-group-config', folder)
}

function setupConfig(folder: string) {
  const dir = makeFolderDir(folder)
  return getConfig({
    disableLogging: false,
    routesDirectory: dir,
    generatedRouteTree: dir + '/routeTree.gen.ts',
  })
}

describe('route files named like a route group', () => {
  // (The file names have parentheses, which the shared diagnostics oracle
  // does not read as paths: the file is matched as a path suffix.)
  const testCases = [
    { folder: 'flat-flat', file: /\(group\)\.tsx/ },
    { folder: 'nested-flat', file: /\(group\)\.tsx/ },
    { folder: 'flat-nested', file: /nested[\\/]\(group\)\.tsx/ },
    { folder: 'nested-nested', file: /nested[\\/]\(group\)\.tsx/ },
  ]

  it.each(testCases)(
    'a (group).tsx route file is reported by name: $folder',
    async ({ folder, file }) => {
      const config = setupConfig(folder)
      const generator = new Generator({ config, root: makeFolderDir(folder) })
      const { result: error, diagnostics } = await captureConsole(() =>
        generator.run().then(
          () => undefined,
          (e: unknown) => e as Error,
        ),
      )
      if (error) {
        expect(error.message).toMatch(file)
      } else {
        expect(
          diagnostics.some(
            (diagnostic) =>
              diagnostic.severity !== 'info' && file.test(diagnostic.text),
          ),
        ).toBe(true)
        await routesOf(config.generatedRouteTree)
      }
    },
  )
})
