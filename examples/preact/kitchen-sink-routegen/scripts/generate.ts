import watch from 'watch'
import path, { relative } from 'path'
import fs from 'fs/promises'

const config = {
  rootDirectory: path.resolve(__dirname, '..'),
  sourceDirectory: path.resolve(__dirname, '../src/'),
  routesDirectory: path.resolve(__dirname, '../src/routes'),
  routeConfigFile: path.resolve(__dirname, '../src/routeConfig.gen.tsx'),
}

main()

function main() {
  watch.watchTree(config.routesDirectory, function (f, curr, prev) {
    // if (typeof f == 'object' && prev === null && curr === null) {
    //   console.log('done')
    // } else if (prev === null) {
    //   console.log('new file')
    // } else if (curr.nlink === 0) {
    //   console.log('removed')
    // } else {
    //   console.log('changed')
    // }
    generate()
  })
}

// const routeConfig = createRouteConfig().addChildren([
//   indexRoute,
//   dashboardRoute.addChildren([
//     dashboardIndexRoute,
//     invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
//     usersRoute.addChildren([usersIndexRoute, userRoute]),
//   ]),
//   expensiveRoute,
//   authenticatedRoute,
//   layoutRoute.addChildren([layoutRouteA, layoutRouteB]),
// ])

type RouteNode = {
  partialPath: string
  partialPathNoExt: string
  fullPath: string
  relativePathToSrc: string
  relativePathToRoutes: string
  isDirectory: boolean
  variable: string
  childRoutesDir?: string
  children?: RouteNode[]
}

async function generate() {
  const flatNodes: RouteNode[] = []

  async function reparent(dir: string): Promise<RouteNode[]> {
    const dirList = await fs.readdir(dir)

    const dirListCombo = multiSortBy(
      await Promise.all(
        dirList.map(async (d): Promise<RouteNode> => {
          const fullPath = path.resolve(dir, d)
          const stat = await fs.lstat(fullPath)

          const relativePathToSrc = relative(config.sourceDirectory, fullPath)
          const relativePathToRoutes = relative(
            config.routesDirectory,
            fullPath,
          )
          return {
            partialPath: d,
            partialPathNoExt: removeExt(d),
            fullPath,
            relativePathToSrc,
            relativePathToRoutes,
            variable: fileToVariable(removeExt(relativePathToRoutes)),
            isDirectory: stat.isDirectory(),
          }
        }),
      ),
      [
        (d) => (d.partialPathNoExt === 'index' ? -1 : 1),
        (d) => d.partialPathNoExt,
        (d) => (d.isDirectory ? 1 : -1),
      ],
    )

    const reparented: typeof dirListCombo = []

    dirListCombo.forEach(async (d, i) => {
      if (d.isDirectory) {
        const parent = reparented.find(
          (dd) => !dd.isDirectory && dd.partialPathNoExt === d.partialPath,
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
          return {
            ...d,
            children: await reparent(d.childRoutesDir),
          }
        }
        return d
      }),
    )
  }

  // return `\n[${children.map((f) => f).join(',\n')}]`

  const reparented = await reparent(config.routesDirectory)

  function buildRouteConfig(nodes: RouteNode[], depth = 1): string {
    const children = nodes
      .map((node) => {
        flatNodes.push(node)
        const route = fileToVariable(removeExt(node.relativePathToRoutes))

        if (node.children?.length) {
          const childConfigs = buildRouteConfig(node.children, depth + 1)
          return `${route}.addChildren([\n${spaces(
            depth * 4,
          )}${childConfigs}\n${spaces(depth * 2)}])`
        }

        return route
      })
      .join(`,\n${spaces(depth * 2)}`)

    return children
  }

  const routeConfigChildrenText = buildRouteConfig(reparented)

  const imports = `import { createRouteConfig } from '@tanstack/react-router'`

  const routeImports = flatNodes
    .map((d) => {
      return `import ${d.variable} from './${removeExt(d.relativePathToSrc)}'`
    })
    .join('\n')

  const routeConfig = `export const routeConfig = createRouteConfig().addChildren([\n  ${routeConfigChildrenText}\n])`

  const fileText = [imports, routeImports, routeConfig].join('\n\n')

  await fs.writeFile(config.routeConfigFile, fileText)
}

function fileToVariable(d: string) {
  return d.replace(/([^a-zA-Z0-9]|[\.])/gm, '')
}

function removeExt(d: string) {
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
