import fs from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  index,
  layout,
  physical,
  rootRoute,
  route,
} from '@tanstack/virtual-file-routes'
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

async function traverseDirectory(
  dir: string,
  handleFile: (filePath: string) => void | Promise<void>,
) {
  const files = await fs.readdir(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = join(dir, file.name)

    if (file.isDirectory()) {
      await traverseDirectory(filePath, handleFile)
    } else {
      await handleFile(filePath)
    }
  }
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
    case 'custom-tokens':
      config.indexToken = '_1nd3x'
      config.routeToken = '_r0ut3_'
      break
    case 'virtual':
      {
        const virtualRouteConfig = rootRoute('root.tsx', [
          index('index.tsx'),
          layout('layout.tsx', [
            route('/dashboard', 'db/dashboard.tsx', [
              index('db/dashboard-index.tsx'),
              route('/invoices', 'db/dashboard-invoices.tsx', [
                index('db/invoices-index.tsx'),
                route('$id', 'db/invoice-detail.tsx'),
              ]),
            ]),
            physical('/hello', 'subtree'),
          ]),
        ])
        config.virtualRouteConfig = virtualRouteConfig
      }
      break
    case 'types-disabled':
      config.disableTypes = true
      config.generatedRouteTree =
        makeFolderDir(folderName) + '/routeTree.gen.js'
      break
    case 'custom-scaffolding':
      config.customScaffolding = {
        routeTemplate: [
          'import * as React from "react";\n',
          '%%tsrImports%%\n\n',
          '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
          'function RouteComponent() { return "Hello %%tsrPath%%!" };\n',
        ].join(''),
        apiTemplate: [
          'import { json } from "@tanstack/start";\n',
          '%%tsrImports%%\n\n',
          '%%tsrExportStart%%{ GET: ({ request, params }) => { return json({ message: "Hello /api/test" }) }}%%tsrExportEnd%%\n',
        ].join(''),
      }
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
      break
    }
    case 'custom-scaffolding': {
      const makeEmptyFile = async (...file: Array<string>) => {
        const filePath = join(makeFolderDir(folderName), 'routes', ...file)
        const dir = dirname(filePath)
        await fs.mkdir(dir, { recursive: true })
        const fh = await fs.open(filePath, 'w')
        await fh.close()
      }

      await makeEmptyFile('__root.tsx')
      await makeEmptyFile('index.tsx')
      await makeEmptyFile('foo.lazy.tsx')
      await makeEmptyFile('api', 'bar.tsx')
      break
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
      break
    }
    case 'custom-scaffolding': {
      const startDir = join(makeFolderDir(folderName), 'routes')
      await traverseDirectory(startDir, async (filePath) => {
        const relativePath = relative(startDir, filePath)
        if (filePath.endsWith('.tsx')) {
          expect(await fs.readFile(filePath, 'utf-8')).toMatchFileSnapshot(
            join('generator', folderName, 'snapshot', relativePath),
          )
        }
      })
    }
  }
}

function shouldThrow(folderName: string) {
  if (folderName === 'duplicate-fullPath') {
    return `Conflicting configuration paths were found for the following routes: "/", "/".`
  }
  return undefined
}

describe('generator works', async () => {
  const folderNames = await readDir()

  it.each(folderNames.map((folder) => [folder]))(
    'should wire-up the routes for a "%s" tree',
    async (folderName) => {
      const config = await setupConfig(folderName)

      rewriteConfigByFolderName(folderName, config)

      await preprocess(folderName)
      const error = shouldThrow(folderName)
      if (error) {
        expect(() => generator(config)).rejects.toThrowError(error)
      } else {
        await generator(config)

        const generatedRouteTree = await getRouteTreeFileText(config)

        expect(generatedRouteTree).toMatchFileSnapshot(
          join(
            'generator',
            folderName,
            `routeTree.snapshot.${config.disableTypes ? 'js' : 'ts'}`,
          ),
        )
      }

      await postprocess(folderName)
    },
  )
})
