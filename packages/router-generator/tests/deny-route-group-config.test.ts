import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { Generator, getConfig } from '../src'
import type { Config } from '../src'

function makeFolderDir(folder: string) {
  return join(process.cwd(), 'tests', 'deny-route-group-config', folder)
}

function setupConfig(
  folder: string,
  inlineConfig: Partial<Omit<Config, 'routesDirectory'>> = {},
) {
  const { generatedRouteTree = `/routeTree.gen.ts`, ...rest } = inlineConfig
  const dir = makeFolderDir(folder)

  const config = getConfig({
    disableLogging: true,
    routesDirectory: dir,
    generatedRouteTree: dir + generatedRouteTree,
    ...rest,
  })
  return config
}

// A route file for a route group (`(group).tsx`) is rejected; the error
// names the file (its wording is free).
describe('deny-route-group-config throws', () => {
  const testCases = [
    { folder: 'flat-flat', file: /\(group\)\.tsx/ },
    { folder: 'nested-flat', file: /\(group\)\.tsx/ },
    { folder: 'flat-nested', file: /nested[\\/]\(group\)\.tsx/ },
    { folder: 'nested-nested', file: /nested[\\/]\(group\)\.tsx/ },
  ]

  it.each(testCases)(
    'should throw an error naming the route group file for the folder: $folder',
    async ({ folder, file }) => {
      const config = setupConfig(folder)
      const folderRoot = makeFolderDir(folder)

      const generator = new Generator({ config, root: folderRoot })
      const error = await generator.run().then(
        () => undefined,
        (e: unknown) => e as Error,
      )
      expect(error).toBeInstanceOf(Error)
      expect(error!.message).toMatch(file)
    },
  )
})
