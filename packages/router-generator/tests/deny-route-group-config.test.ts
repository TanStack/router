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
import { describe, it } from 'vitest'
import {
  captureConsole,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'

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
  const testCases = [
    { folder: 'flat-flat', file: '(group).tsx' },
    { folder: 'nested-flat', file: '(group).tsx' },
    { folder: 'flat-nested', file: 'nested/(group).tsx' },
    { folder: 'nested-nested', file: 'nested/(group).tsx' },
  ]

  it.each(testCases)(
    'a (group).tsx route file is reported by name: $folder',
    async ({ folder, file }) => {
      const config = setupConfig(folder)
      const root = makeFolderDir(folder)
      const generator = new Generator({ config, root })
      const { result: error, diagnostics } = await captureConsole(() =>
        generator.run().then(
          () => undefined,
          (e: unknown) => e as Error,
        ),
      )
      if (error) {
        expectDiagnostic(error, { file, root })
      } else {
        expectDiagnostic(diagnostics, {
          severity: ['error', 'warning'],
          file,
          root,
        })
        await routesOf(config.generatedRouteTree)
      }
    },
  )
})
