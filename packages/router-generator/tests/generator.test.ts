import fs from 'fs/promises'
import { describe, it, expect } from 'vitest'

import { generator, getConfig, type Config } from '../src'

function getFolderDir(folder: string) {
  return process.cwd() + `/tests/${folder}`
}

async function setupConfig(folder: string) {
  const dir = getFolderDir(folder)
  const config = await getConfig({
    disableLogging: true,
    routesDirectory: dir + '/routes',
    generatedRouteTree: dir + '/routeTree.gen.ts',
  })
  return config
}

async function getRouteTreeFileText(config: Config) {
  const location = config.generatedRouteTree
  const text = await fs.readFile(location, 'utf-8')
  return text
}

async function getExpectedRouteTreeFileText(folder: string) {
  const dir = getFolderDir(folder)
  const location = dir + '/routeTree.expected.ts'
  const text = await fs.readFile(location, 'utf-8')
  return text
}

describe('with a default config', () => {
  it('should wire-up the routes for a "single-level" tree', async () => {
    const folderName = 'single-level'
    const config = await setupConfig(folderName)

    await generator(config)

    const [expectedRouteTree, generatedRouteTree] = await Promise.all([
      getExpectedRouteTreeFileText(folderName),
      getRouteTreeFileText(config),
    ])

    expect(generatedRouteTree).equal(expectedRouteTree)
  })

  it('should wire-up the routes for a "flat" tree', async () => {
    const folderName = 'flat'
    const config = await setupConfig(folderName)

    await generator(config)

    const [expectedRouteTree, generatedRouteTree] = await Promise.all([
      getExpectedRouteTreeFileText(folderName),
      getRouteTreeFileText(config),
    ])

    expect(generatedRouteTree).equal(expectedRouteTree)
  })

  it('should wire-up the routes for a "nested" tree', async () => {
    const folderName = 'nested'
    const config = await setupConfig('nested')

    await generator(config)

    const [expectedRouteTree, generatedRouteTree] = await Promise.all([
      getExpectedRouteTreeFileText(folderName),
      getRouteTreeFileText(config),
    ])

    expect(generatedRouteTree).equal(expectedRouteTree)
  })

  it('should wire-up the routes for a "nested-layouts" tree', async () => {
    const folderName = 'nested-layouts'
    const config = await setupConfig(folderName)

    await generator(config)

    const [expectedRouteTree, generatedRouteTree] = await Promise.all([
      getExpectedRouteTreeFileText(folderName),
      getRouteTreeFileText(config),
    ])

    expect(generatedRouteTree).equal(expectedRouteTree)
  })
})
