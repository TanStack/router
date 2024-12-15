import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generator, getConfig } from '../src'
import type { Config } from '../src'

function makeFolderDir(folder: string) {
  return join(process.cwd(), 'tests', 'deny-route-group-config', folder)
}

async function setupConfig(
  folder: string,
  inlineConfig: Partial<Omit<Config, 'routesDirectory'>> = {},
) {
  const { generatedRouteTree = '/routeTree.gen.ts', ...rest } = inlineConfig
  const dir = makeFolderDir(folder)

  const config = await getConfig({
    disableLogging: true,
    routesDirectory: dir,
    generatedRouteTree: dir + generatedRouteTree,
    ...rest,
  })
  return config
}

type TestCases = Array<{
  folder: string
  expectedError: string
}>

describe('deny-route-group-config throws', () => {
  it.each([
    {
      folder: 'flat-flat',
      expectedError:
        'A route configuration for a route group was found at `(group).tsx`. This is not supported. Did you mean to use a layout/pathless route instead?',
    },
    {
      folder: 'nested-flat',
      expectedError:
        'A route configuration for a route group was found at `(group).tsx`. This is not supported. Did you mean to use a layout/pathless route instead?',
    },
    {
      folder: 'flat-nested',
      expectedError:
        'A route configuration for a route group was found at `nested/(group).tsx`. This is not supported. Did you mean to use a layout/pathless route instead?',
    },
    {
      folder: 'nested-nested',
      expectedError:
        'A route configuration for a route group was found at `nested/(group).tsx`. This is not supported. Did you mean to use a layout/pathless route instead?',
    },
  ] satisfies TestCases)(
    'should throw an error for the folder: $folder',
    async ({ folder, expectedError }) => {
      const config = await setupConfig(folder)
      const folderRoot = makeFolderDir(folder)

      await expect(() => generator(config, folderRoot)).rejects.toThrowError(
        expectedError,
      )
    },
  )
})
