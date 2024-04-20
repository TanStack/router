import fs from 'fs/promises'
import { describe, it, expect } from 'vitest'

import { generator, getConfig, type Config } from '../src'

function makeFolderDir(folder: string) {
  return process.cwd() + `/tests/generator/${folder}`
}

async function getFoldersNames() {
  const folders = await fs.readdir(process.cwd() + '/tests/generator')
  return folders
}

async function setupConfig(
  folder: string,
  inlineConfig: Partial<Omit<Config, 'routesDirectory'>> = {},
) {
  const { generatedRouteTree = '/routeTree.gen.ts', ...rest } = inlineConfig
  const dir = makeFolderDir(folder)

  const config = await getConfig({
    disableLogging: true,
    routesDirectory: dir + '/routes',
    generatedRouteTree: dir + generatedRouteTree,
    ...rest,
  })
  return config
}

async function getRouteTreeFileText(config: Config) {
  const location = config.generatedRouteTree
  const text = await fs.readFile(location, 'utf-8')
  return text
}

async function getExpectedRouteTreeFileText(folder: string) {
  const dir = makeFolderDir(folder)
  const location = dir + '/routeTree.expected.ts'
  const text = await fs.readFile(location, 'utf-8')
  return text
}

function rewriteConfigByFolderName(folderName: string, config: Config) {
  switch (folderName) {
    case 'append-and-prepend':
      config.prependToRouteTreeFile = ['// prepend1', '// prepend2']
      config.appendToRouteTreeFile = ['// append1', '// append2']
      break
    default:
      break
  }
}

describe('generator works', async () => {
  const folderNames = await getFoldersNames()

  it.each(folderNames.map((folder) => [folder]))(
    'should wire-up the routes for a "%s" tree',
    async (folderName) => {
      const config = await setupConfig(folderName)

      rewriteConfigByFolderName(folderName, config)

      await generator(config)

      const [expectedRouteTree, generatedRouteTree] = await Promise.all([
        getExpectedRouteTreeFileText(folderName),
        getRouteTreeFileText(config),
      ])

      expect(generatedRouteTree).equal(expectedRouteTree)
    },
  )
})
