import chokidar from 'chokidar'
import klaw from 'klaw'
import through2 from 'through2'
import path, { relative } from 'path'
import fs from 'fs-extra'
import {
  detectExports,
  generateRouteConfig,
  isolatedProperties,
  isolateOptionToExport,
} from './transformCode'

const config = {
  rootDirectory: path.resolve(__dirname, '..'),
  sourceDirectory: path.resolve(__dirname, '../src/'),
  routesDirectory: path.resolve(__dirname, '../src/routes'),
  routeGenDirectory: path.resolve(__dirname, '../src/routes.generated'),
}

export type GeneratorConfig = typeof config

let latestTask = 0

main()

async function main() {
  const watcher = chokidar.watch(config.routesDirectory, {})

  watcher.on('ready', () => {
    try {
      generate()
    } catch (err) {
      console.error(err)
    }

    watcher.on('change', () => {
      try {
        generate()
      } catch (err) {
        console.error(err)
      }
    })
  })
}

export type RouteNode = {
  filename: string
  fileNameNoExt: string
  fullPath: string
  relativePathToSrc: string
  relativePathToRoutes: string
  isDirectory: boolean
  isIndex: boolean
  variable: string
  childRoutesDir?: string
  genPath: string
  genDir: string
  genPathNoExt: string
  parent?: RouteNode
  children?: RouteNode[]
}

export type IsolatedExport = {
  key: string
  exported: boolean
  code?: string | null
}

async function generate() {
  const taskId = latestTask + 1
  latestTask = taskId
  console.log('Generating routes...')
  const start = Date.now()
  let routeConfigImports: string[] = []

  const fileQueue: [string, string][] = []
  const queueWriteFile = (filename: string, content: string) => {
    fileQueue.push([filename, content])
  }

  async function reparent(dir: string): Promise<RouteNode[]> {
    const dirList = await fs.readdir(dir)

    const dirListCombo = multiSortBy(
      await Promise.all(
        dirList.map(async (filename): Promise<RouteNode> => {
          const fullPath = path.resolve(dir, filename)
          const stat = await fs.lstat(fullPath)

          const relativePathToSrc = relative(config.sourceDirectory, fullPath)
          const relativePathToRoutes = relative(
            config.routesDirectory,
            fullPath,
          )

          const genPath = path.resolve(
            config.routeGenDirectory,
            relativePathToRoutes,
          )
          const genPathNoExt = removeExt(genPath)
          const genDir = path.resolve(genPath, '..')

          const fileNameNoExt = removeExt(filename)

          return {
            filename,
            fileNameNoExt,
            fullPath,
            relativePathToSrc,
            relativePathToRoutes,
            genPath,
            genDir,
            genPathNoExt,
            variable: fileToVariable(removeExt(relativePathToRoutes)),
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
    const children = nodes
      .filter((d) => {
        if (
          removeExt(d.fullPath) === path.resolve(config.routesDirectory, 'root')
        ) {
          return false
        }

        return true
      })
      .map(async (node) => {
        // Generate the isolated files
        const routeCode = await fs.readFile(node.fullPath, 'utf-8')

        const transforms = await Promise.all(
          isolatedProperties.map(async (key): Promise<IsolatedExport> => {
            let exported = false
            let exports: string[] = []

            const transformed = await isolateOptionToExport(routeCode, {
              ssr: true,
              isolate: key,
            })

            if (transformed?.code) {
              exports = await detectExports(transformed?.code)
              if (exports.includes(key)) {
                exported = true
              }
            }

            return { key, exported, code: transformed?.code }
          }),
        )

        const imports = transforms.filter(({ exported }) => exported)

        await Promise.all(
          imports.map(({ key, code }) =>
            queueWriteFile(`${node.genPathNoExt}-${key}.tsx`, code!),
          ),
        )

        const routeConfigCode = await generateRouteConfig(
          routeCode,
          node,
          config,
          imports,
        )

        queueWriteFile(node.genPath, routeConfigCode)

        routeConfigImports.push(
          `import { ${node.variable}Route } from './${removeExt(
            path.relative(config.routeGenDirectory, node.genPath),
          )}'`,
        )

        const route = `${node.variable}Route`

        if (node.children?.length) {
          const childConfigs = await buildRouteConfig(node.children, depth + 1)
          return `${route}.addChildren([\n${spaces(
            depth * 4,
          )}${childConfigs}\n${spaces(depth * 2)}])`
        }

        return route
      })

    return (await Promise.all(children)).join(`,\n${spaces(depth * 2)}`)
  }

  const routeConfigChildrenText = await buildRouteConfig(reparented)

  routeConfigImports.unshift(
    `import { rootRoute } from '${path.relative(
      config.routeGenDirectory,
      path.resolve(config.routesDirectory, 'root'),
    )}'`,
  )

  routeConfigImports = multiSortBy(routeConfigImports, [
    (d) => d.split('/').length,
    (d) => (d.endsWith("index'") ? -1 : 1),
    (d) => d,
  ])

  const routeConfig = `export const routeConfig = rootRoute.addChildren([\n  ${routeConfigChildrenText}\n])`

  const fileText = [routeConfigImports.join('\n'), routeConfig].join('\n\n')

  queueWriteFile(
    path.resolve(config.routeGenDirectory, 'routeConfig.ts'),
    fileText,
  )

  // Do all of our file system manipulation at the end
  await fs.mkdir(config.routeGenDirectory, { recursive: true })

  let newFileCount = 0

  if (latestTask !== taskId) {
    console.log(`- Skipping since file changes were made while generating.`)
    return
  }

  await Promise.all(
    fileQueue.map(async ([filename, content]) => {
      await fs.ensureDir(path.dirname(filename))
      const exists = await fs.pathExists(filename)
      let current = ''
      if (exists) {
        current = await fs.readFile(filename, 'utf-8')
      }
      if (current !== content) {
        newFileCount++
        await fs.writeFile(filename, content)
      }
    }),
  )

  const allFiles = await getAllFiles(config.routeGenDirectory)
  const unusedFiles = allFiles.filter(
    (d) => !fileQueue.find(([filename]) => filename === d),
  )

  await Promise.all(unusedFiles.map((d) => fs.remove(d)))

  console.log(
    `- Done! Built ${fileQueue.length} files in ${Date.now() - start}ms`,
  )

  if (!newFileCount) {
    console.log(`- No changes were found. Carry on!`)
  } else {
    console.log(
      `- Updated ${routeConfigImports.length} routes (${fileQueue.length} files)`,
    )
  }

  if (unusedFiles.length) {
    console.log(`- Removed ${unusedFiles.length} old files.`)
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
