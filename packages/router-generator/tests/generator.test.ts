import fs from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generator, getConfig } from '../src'
import type { Config } from '../src'

function makeFolderDir(folder: string) {
  return join(process.cwd(), 'tests', 'generator', folder)
}

async function readDir(...paths: Array<string>) {
  const folders = await fs.readdir(
    join(process.cwd(), 'tests', 'generator', ...paths),
  )
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

function rewriteConfigByFolderName(folderName: string, config: Config) {
  switch (folderName) {
    case 'append-and-prepend':
      config.routeTreeFileHeader = ['// prepend1', '// prepend2']
      config.routeTreeFileFooter = ['// append1', '// append2']
      break
    case 'no-manifest':
      config.disableManifestGeneration = true
      break
    default:
      break
  }
}

async function preprocess(folderName: string) {
  switch (folderName) {
    case 'file-modification': {
      const templatePath = join(makeFolderDir(folderName), 'template.tsx')
      const lazyTemplatePath = join(
        makeFolderDir(folderName),
        'template.lazy.tsx',
      )

      const makeRoutePath = (file: string) =>
        join(makeFolderDir(folderName), 'routes', '(test)', file)
      const makeEmptyFile = async (file: string) => {
        const fh = await fs.open(makeRoutePath(file), 'w')
        await fh.close()
      }

      await fs.copyFile(templatePath, makeRoutePath('foo.tsx'))
      await fs.copyFile(lazyTemplatePath, makeRoutePath('initiallyLazy.tsx'))
      await fs.copyFile(templatePath, makeRoutePath('bar.lazy.tsx'))
      await makeEmptyFile('initiallyEmpty.tsx')
      await makeEmptyFile('initiallyEmpty.lazy.tsx')
    }
  }
}

async function postprocess(folderName: string) {
  switch (folderName) {
    case 'file-modification': {
      const fooPath = join(
        makeFolderDir(folderName),
        'routes',
        '(test)',
        'foo.tsx',
      )
      const fooText = await fs.readFile(fooPath, 'utf-8')
      const routeFiles = await readDir(folderName, 'routes', '(test)')
      routeFiles
        .filter((r) => r.endsWith('.tsx'))
        .forEach((routeFile) => {
          expect(fooText).toMatchFileSnapshot(
            join('generator', folderName, 'snapshot', routeFile),
          )
        })
    }
  }
}

describe('generator works', async () => {
  const folderNames = await readDir()

  it.each(folderNames.map((folder) => [folder]))(
    'should wire-up the routes for a "%s" tree',
    async (folderName) => {
      const config = await setupConfig(folderName)

      rewriteConfigByFolderName(folderName, config)

      await preprocess(folderName)
      await generator(config)

      const generatedRouteTree = await getRouteTreeFileText(config)

      expect(generatedRouteTree).toMatchFileSnapshot(
        join('generator', folderName, 'routeTree.snapshot.ts'),
      )
      await postprocess(folderName)
    },
  )
})
