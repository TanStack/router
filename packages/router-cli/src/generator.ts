import klaw from 'klaw'
import through2 from 'through2'
import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import {
  detectExports,
  ensureBoilerplate,
  generateRouteConfig,
  isolatedProperties,
  isolateOptionToExport,
} from './transformCode'
import { Config } from './config'

let latestTask = 0
export const rootRouteName = 'root'
export const rootRouteClientName = 'root.client'

export type RouteNode = {
  filename: string
  clientFilename: string
  fileNameNoExt: string
  fullPath: string
  fullDir: string
  isDirectory: boolean
  isIndex: boolean
  variable: string
  childRoutesDir?: string
  genPath: string
  genDir: string
  genPathNoExt: string
  parent?: RouteNode
  hash?: string
  importedFiles?: string[]
  version?: number
  changed?: boolean
  new?: boolean
  isRoot?: boolean
  children?: RouteNode[]
}

export type IsolatedExport = {
  key: string
  exported: boolean
  code?: string | null
}

let nodeCache: RouteNode[] = undefined!

export async function generator(config: Config) {
  console.log()

  let first = false

  if (!nodeCache) {
    first = true
    console.log('🔄 Generating routes...')
    nodeCache = []
  } else {
    console.log('♻️  Regenerating routes...')
  }

  const taskId = latestTask + 1
  latestTask = taskId

  const checkLatest = () => {
    if (latestTask !== taskId) {
      console.log(`- Skipping since file changes were made while generating.`)
      return false
    }

    return true
  }

  const start = Date.now()
  let routeConfigImports: string[] = []
  let routeConfigClientImports: string[] = []

  let nodesChanged = false
  const fileQueue: [string, string][] = []
  const queueWriteFile = (filename: string, content: string) => {
    fileQueue.push([filename, content])
  }

  async function reparent(dir: string): Promise<RouteNode[]> {
    let dirList

    try {
      dirList = await fs.readdir(dir)
    } catch (err) {
      console.log()
      console.error(
        'TSR: Error reading the config.routesDirectory. Does it exist?',
      )
      console.log()
      throw err
    }

    const dirListCombo = multiSortBy(
      await Promise.all(
        dirList.map(async (filename): Promise<RouteNode> => {
          const fullPath = path.resolve(dir, filename)
          const stat = await fs.lstat(fullPath)
          const ext = path.extname(filename)

          const clientFilename = filename.replace(ext, `.client${ext}`)

          const pathFromRoutes = path.relative(config.routesDirectory, fullPath)
          const genPath = path.resolve(config.routeGenDirectory, pathFromRoutes)

          const genPathNoExt = removeExt(genPath)
          const genDir = path.resolve(genPath, '..')

          const fileNameNoExt = removeExt(filename)

          return {
            filename,
            clientFilename,
            fileNameNoExt,
            fullPath,
            fullDir: dir,
            genPath,
            genDir,
            genPathNoExt,
            variable: fileToVariable(removeExt(pathFromRoutes)),
            isDirectory: stat.isDirectory(),
            isIndex: fileNameNoExt === 'index',
          }
        }),
      ),
      [
        (d) => (d.fileNameNoExt === 'index' ? -1 : 1),
        (d) => d.fileNameNoExt,
        (d) => (d.isDirectory ? 1 : -1),
      ],
    )

    const reparented: typeof dirListCombo = []

    dirListCombo.forEach(async (d, i) => {
      if (d.isDirectory) {
        const parent = reparented.find(
          (dd) => !dd.isDirectory && dd.fileNameNoExt === d.filename,
        )

        if (parent) {
          parent.childRoutesDir = d.fullPath
        } else {
          reparented.push(d)
        }
      } else {
        reparented.push(d)
      }
    })

    return Promise.all(
      reparented.map(async (d) => {
        if (d.childRoutesDir) {
          const children = await reparent(d.childRoutesDir)

          d = {
            ...d,
            children,
          }

          children.forEach((child) => (child.parent = d))

          return d
        }
        return d
      }),
    )
  }

  const reparented = await reparent(config.routesDirectory)

  async function buildRouteConfig(
    nodes: RouteNode[],
    depth = 1,
  ): Promise<string> {
    const children = nodes.map(async (n) => {
      let node = nodeCache.find((d) => d.fullPath === n.fullPath)!

      if (node) {
        node.new = false
      } else {
        node = n
        nodeCache.push(node)
        if (!first) {
          node.new = true
        }
      }

      node.version = latestTask
      if (node.fileNameNoExt === rootRouteName) {
        node.isRoot = true
      }

      const routeCode = await fs.readFile(node.fullPath, 'utf-8')

      const hashSum = crypto.createHash('sha256')
      hashSum.update(routeCode)
      const hash = hashSum.digest('hex')

      node.changed = node.hash !== hash
      if (node.changed) {
        nodesChanged = true
        node.hash = hash

        try {
          // Ensure the boilerplate for the route exists
          const code = await ensureBoilerplate(node, routeCode)

          if (code) {
            await fs.writeFile(node.fullPath, code)
          }

          let imports: IsolatedExport[] = []

          // Generate the isolated files
          const transforms = await Promise.all(
            isolatedProperties.map(async (key): Promise<IsolatedExport> => {
              let exported = false
              let exports: string[] = []

              const transformed = await isolateOptionToExport(node, routeCode, {
                isolate: key,
              })

              if (transformed) {
                exports = await detectExports(transformed)
                if (exports.includes(key)) {
                  exported = true
                }
              }

              return { key, exported, code: transformed }
            }),
          )

          imports = transforms.filter(({ exported }) => exported)

          node.importedFiles = await Promise.all(
            imports.map(({ key, code }) => {
              const importFilename = `${node.genPathNoExt}-${key}.tsx`
              queueWriteFile(importFilename, code!)
              return importFilename
            }),
          )

          const routeConfigCode = await generateRouteConfig(
            node,
            routeCode,
            imports,
            false,
          )

          const clientRouteConfigCode = await generateRouteConfig(
            node,
            routeCode,
            imports,
            true,
          )

          queueWriteFile(node.genPath, routeConfigCode)
          queueWriteFile(
            path.resolve(node.genDir, node.clientFilename),
            clientRouteConfigCode,
          )
        } catch (err) {
          node.hash = ''
          throw err
        }
      }

      routeConfigImports.push(
        `import { route as ${node.variable}Route } from './${removeExt(
          path
            .relative(config.routeGenDirectory, node.genPath)
            .replace(/\\/gi, '/'),
        )}'`,
      )

      routeConfigClientImports.push(
        `import { route as ${node.variable}Route } from './${removeExt(
          path
            .relative(
              config.routeGenDirectory,
              path.resolve(node.genDir, node.clientFilename),
            )
            .replace(/\\/gi, '/'),
        )}'`,
      )

      if (node.isRoot) {
        return undefined
      }

      const route = `${node.variable}Route`

      if (node.children?.length) {
        const childConfigs = await buildRouteConfig(node.children, depth + 1)
        return `${route}.addChildren([\n${spaces(
          depth * 4,
        )}${childConfigs}\n${spaces(depth * 2)}])`
      }

      return route
    })

    return (await Promise.all(children))
      .filter(Boolean)
      .join(`,\n${spaces(depth * 2)}`)
  }

  const routeConfigChildrenText = await buildRouteConfig(reparented)

  routeConfigImports = multiSortBy(routeConfigImports, [
    (d) => (d.includes(rootRouteName) ? -1 : 1),
    (d) => d.split('/').length,
    (d) => (d.endsWith("index'") ? -1 : 1),
    (d) => d,
  ])

  routeConfigClientImports = multiSortBy(routeConfigClientImports, [
    (d) => (d.includes(rootRouteName) ? -1 : 1),
    (d) => d.split('/').length,
    (d) => (d.endsWith("index.client'") ? -1 : 1),
    (d) => d,
  ])

  const routeConfig = `export const routeTree = rootRoute.addChildren([\n  ${routeConfigChildrenText}\n])\nexport type __GeneratedRouteConfig = typeof routeTree`
  const routeConfigClient = `export const routeTreeClient = rootRoute.addChildren([\n  ${routeConfigChildrenText}\n]) as __GeneratedRouteConfig`

  const routeConfigFileContent = [
    routeConfigImports.join('\n'),
    routeConfig,
  ].join('\n\n')

  const routeConfigClientFileContent = [
    `import type { __GeneratedRouteConfig } from './routeTree'`,
    routeConfigClientImports.join('\n'),
    routeConfigClient,
  ].join('\n\n')

  if (nodesChanged) {
    queueWriteFile(
      path.resolve(config.routeGenDirectory, 'routeTree.ts'),
      routeConfigFileContent,
    )
    queueWriteFile(
      path.resolve(config.routeGenDirectory, 'routeTree.client.ts'),
      routeConfigClientFileContent,
    )
  }

  // Do all of our file system manipulation at the end
  await fs.mkdir(config.routeGenDirectory, { recursive: true })

  if (!checkLatest()) return

  await Promise.all(
    fileQueue.map(async ([filename, content]) => {
      await fs.ensureDir(path.dirname(filename))
      const exists = await fs.pathExists(filename)
      let current = ''
      if (exists) {
        current = await fs.readFile(filename, 'utf-8')
      }
      if (current !== content) {
        await fs.writeFile(filename, content)
      }
    }),
  )

  if (!checkLatest()) return

  const allFiles = await getAllFiles(config.routeGenDirectory)

  if (!checkLatest()) return

  const removedNodes: RouteNode[] = []

  nodeCache = nodeCache.filter((d) => {
    if (d.version !== latestTask) {
      removedNodes.push(d)
      return false
    }
    return true
  })

  const newNodes = nodeCache.filter((d) => d.new)
  const updatedNodes = nodeCache.filter((d) => !d.new && d.changed)

  const unusedFiles = allFiles.filter((d) => {
    if (
      d === path.resolve(config.routeGenDirectory, 'routeTree.ts') ||
      d === path.resolve(config.routeGenDirectory, 'routeTree.client.ts')
    ) {
      return false
    }

    let node = nodeCache.find(
      (n) =>
        n.genPath === d ||
        path.resolve(n.genDir, n.clientFilename) === d ||
        n.importedFiles?.includes(d),
    )

    return !node
  })

  await Promise.all(
    unusedFiles.map((d) => {
      fs.remove(d)
    }),
  )

  console.log(
    `🌲 Processed ${nodeCache.length} routes in ${Date.now() - start}ms`,
  )

  if (newNodes.length || updatedNodes.length || removedNodes.length) {
    if (newNodes.length) {
      console.log(`🥳 Added ${newNodes.length} new routes`)
    }

    if (updatedNodes.length) {
      console.log(`✅ Updated ${updatedNodes.length} routes`)
    }

    if (removedNodes.length) {
      console.log(`🗑 Removed ${removedNodes.length} unused routes`)
    }
  } else {
    console.log(`🎉 No changes were found. Carry on!`)
  }
}

function getAllFiles(dir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const excludeDirFilter = through2.obj(function (item, enc, next) {
      if (!item.stats.isDirectory()) this.push(item)
      next()
    })

    const items: string[] = []

    klaw(dir)
      .pipe(excludeDirFilter)
      .on('data', (item) => items.push(item.path))
      .on('error', (err) => reject(err))
      .on('end', () => resolve(items))
  })
}

function fileToVariable(d: string) {
  return d
    .split('/')
    .map((d, i) => (i > 0 ? capitalize(d) : d))
    .join('')
    .replace(/([^a-zA-Z0-9]|[\.])/gm, '')
}

export function removeExt(d: string) {
  return d.substring(0, d.lastIndexOf('.')) || d
}

function spaces(d: number): string {
  return Array.from({ length: d })
    .map(() => ' ')
    .join('')
}

export function multiSortBy<T>(
  arr: T[],
  accessors: ((item: T) => any)[] = [(d) => d],
): T[] {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}

function capitalize(s: string) {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
