import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import { Config } from './config'

let latestTask = 0
export const rootRouteName = 'root'

export type RouteNode = {
  filename: string
  fullPath: string
  variableName: string
  routePath?: string
  path?: string
  id?: string
  hash?: string
  version?: number
  changed?: boolean
  new?: boolean
  isRoot?: boolean
  children?: RouteNode[]
  parent?: RouteNode
}

let nodeCache: RouteNode[] = undefined!

async function createRouteNode(
  config: Config,
  fileName: string,
): Promise<RouteNode> {
  const filename = path.basename(fileName)
  const fullPath = path.resolve(config.routesDirectory, filename)
  const fileNameNoExt = removeExt(filename)
  let routePath = fileNameNoExt.split('.').join('/')

  // Remove the index from the route path and
  // if the route path is empty, use `/'
  if (routePath.endsWith('/index')) {
    routePath = routePath.replace(/\/index$/, '/')
  } else if (routePath === 'index') {
    routePath = '/'
  }

  return {
    filename,
    fullPath,
    routePath,
    variableName: fileToVariable(removeExt(filename)),
  }
}

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

  let nodesChanged = false
  const fileQueue: [string, string][] = []
  const queueWriteFile = (filename: string, content: string) => {
    fileQueue.push([filename, content])
  }

  let dirList

  try {
    dirList = await fs.readdir(config.routesDirectory)
  } catch (err) {
    console.log()
    console.error(
      'TSR: Error reading the config.routesDirectory. Does it exist?',
    )
    console.log()
    throw err
  }

  let routeNodes = await Promise.all(
    dirList.map(async (filename): Promise<RouteNode> => {
      return createRouteNode(config, filename)
    }),
  )

  routeNodes = multiSortBy(routeNodes, [
    (d) => (d.routePath === '/' ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) => (d.routePath?.endsWith('/') ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => d.routePath !== '_root')

  const routeTree: RouteNode[] = []

  // Loop over the flat list of routeNodes and
  // build up a tree based on the routeNodes' routePath
  routeNodes.forEach((node) => {
    const findParent = (
      existing: RouteNode[],
      node: RouteNode,
      parentNode?: RouteNode,
    ) => {
      const parent = existing.find((d) => {
        return node.routePath?.startsWith(d.path!)
      })

      if (parent) {
        if (!parent.children) {
          parent.children = []
        }

        findParent(parent.children, node, parent)
      } else {
        node.path = node.routePath?.replace(parentNode?.routePath ?? '', '')
        node.parent = parentNode
        existing.push(node)
      }
    }

    findParent(routeTree, node)
  })

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
        } catch (err) {
          node.hash = ''
          throw err
        }
      }

      const route = `${node.variableName}Route`

      routeConfigImports.push(
        `import { route as ${route} } from './${removeExt(
          path.relative(
            path.dirname(config.generatedRouteTree),
            path.resolve(config.routesDirectory, node.filename),
          ),
        )}'`,
      )

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

  const routeConfigChildrenText = await buildRouteConfig(routeTree)

  routeConfigImports = multiSortBy(routeConfigImports, [
    (d) => (d.includes(rootRouteName) ? -1 : 1),
    (d) => d.split('/').length,
    (d) => (d.endsWith("index'") ? -1 : 1),
    (d) => d,
  ])

  const routeConfig = `export const routeTree = rootRoute.addChildren([\n  ${routeConfigChildrenText}\n])`

  const routeConfigFileContent = [
    `import { route as rootRoute } from './${path.relative(
      path.dirname(config.generatedRouteTree),
      path.resolve(config.routesDirectory, '_root'),
    )}'`,
    routeConfigImports.join('\n'),
    `declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    ${routeNodes
      .map((routeNode) => {
        return `'${routeNode.routePath}': {
      parentRoute: typeof ${routeNode.parent?.variableName ?? 'root'}Route
    }`
      })
      .join('\n    ')}  
  }
}`,
    routeNodes
      .map((routeNode) => {
        return `Object.assign(${
          routeNode.variableName ?? 'root'
        }Route.options, {
  path: '${routeNode.path}',
  getParentRoute: () => ${`${routeNode.parent?.variableName ?? 'root'}Route,
})`}`
      })
      .join('\n'),
    routeConfig,
  ].join('\n\n')

  if (nodesChanged) {
    queueWriteFile(
      path.resolve(config.generatedRouteTree),
      routeConfigFileContent,
    )
  }

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

async function ensureBoilerplate(node: RouteNode, code: string) {
  if (node.isRoot) {
    return
  }

  // Ensure that new FileRoute(anything?) is replace with FileRoute(${node.routePath})
  const replaced = code.replace(
    /new\s+FileRoute\(([^)]*)\)/g,
    `new FileRoute('${node.routePath}')`,
  )

  if (replaced !== code) {
    return replaced
  }

  return
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
