import path from 'node:path'
import * as fsp from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import crypto from 'node:crypto'
import { deepEqual, rootRouteId } from '@tanstack/router-core'
import { logging } from './logger'
import {
  isVirtualConfigFile,
  getRouteNodes as physicalGetRouteNodes,
} from './filesystem/physical/getRouteNodes'
import { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes'
import { rootPathId } from './filesystem/physical/rootPathId'
import {
  buildFileRoutesByPathInterface,
  buildImportString,
  buildRouteTreeConfig,
  checkFileExists,
  createRouteNodesByFullPath,
  createRouteNodesById,
  createRouteNodesByTo,
  determineNodePath,
  findParent,
  format,
  getResolvedRouteNodeVariableName,
  hasParentRoute,
  isRouteNodeValidForAugmentation,
  lowerCaseFirstChar,
  mergeImportDeclarations,
  multiSortBy,
  removeExt,
  removeGroups,
  removeLastSegmentFromPath,
  removeLayoutSegments,
  removeUnderscores,
  replaceBackslash,
  resetRegex,
  routePathToVariable,
  trimPathLeft,
} from './utils'
import { fillTemplate, getTargetTemplate } from './template'
import { transform } from './transform/transform'
import { defaultGeneratorPlugin } from './plugin/default-generator-plugin'
import type {
  GeneratorPlugin,
  GeneratorPluginWithTransform,
} from './plugin/types'
import type { TargetTemplate } from './template'
import type {
  FsRouteType,
  GetRouteNodesResult,
  GetRoutesByFileMapResult,
  HandleNodeAccumulator,
  ImportDeclaration,
  RouteNode,
} from './types'
import type { Config } from './config'
import type { Logger } from './logger'
import type { TransformPlugin } from './transform/types'

interface fs {
  stat: (
    filePath: string,
  ) => Promise<{ mtimeMs: bigint; mode: number; uid: number; gid: number }>
  rename: (oldPath: string, newPath: string) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
  readFile: (
    filePath: string,
  ) => Promise<
    { stat: { mtimeMs: bigint }; fileContent: string } | 'file-not-existing'
  >
  chmod: (filePath: string, mode: number) => Promise<void>
  chown: (filePath: string, uid: number, gid: number) => Promise<void>
}

const DefaultFileSystem: fs = {
  stat: async (filePath) => {
    const res = await fsp.stat(filePath, { bigint: true })
    return {
      mtimeMs: res.mtimeMs,
      mode: Number(res.mode),
      uid: Number(res.uid),
      gid: Number(res.gid),
    }
  },
  rename: (oldPath, newPath) => fsp.rename(oldPath, newPath),
  writeFile: (filePath, content) => fsp.writeFile(filePath, content),
  readFile: async (filePath: string) => {
    try {
      const fileHandle = await fsp.open(filePath, 'r')
      const stat = await fileHandle.stat({ bigint: true })
      const fileContent = (await fileHandle.readFile()).toString()
      await fileHandle.close()
      return { stat, fileContent }
    } catch (e: any) {
      if ('code' in e) {
        if (e.code === 'ENOENT') {
          return 'file-not-existing'
        }
      }
      throw e
    }
  },
  chmod: (filePath, mode) => fsp.chmod(filePath, mode),
  chown: (filePath, uid, gid) => fsp.chown(filePath, uid, gid),
}

interface Rerun {
  rerun: true
  msg?: string
  event: GeneratorEvent
}
function rerun(opts: { msg?: string; event?: GeneratorEvent }): Rerun {
  const { event, ...rest } = opts
  return { rerun: true, event: event ?? { type: 'rerun' }, ...rest }
}

function isRerun(result: unknown): result is Rerun {
  return (
    typeof result === 'object' &&
    result !== null &&
    'rerun' in result &&
    result.rerun === true
  )
}

export type FileEventType = 'create' | 'update' | 'delete'
export type FileEvent = {
  type: FileEventType
  path: string
}
export type GeneratorEvent = FileEvent | { type: 'rerun' }

type FileCacheChange<TCacheEntry extends GeneratorCacheEntry> =
  | {
      result: false
      cacheEntry: TCacheEntry
    }
  | { result: true; mtimeMs: bigint; cacheEntry: TCacheEntry }
  | {
      result: 'file-not-in-cache'
    }
  | {
      result: 'cannot-stat-file'
    }

interface GeneratorCacheEntry {
  mtimeMs: bigint
  fileContent: string
}

interface RouteNodeCacheEntry extends GeneratorCacheEntry {
  exports: Array<string>
  routeId: string
}

type GeneratorRouteNodeCache = Map</** filePath **/ string, RouteNodeCacheEntry>

export class Generator {
  /**
   * why do we have two caches for the route files?
   * During processing, we READ from the cache and WRITE to the shadow cache.
   *
   * After a route file is processed, we write to the shadow cache.
   * If during processing we bail out and re-run, we don't lose this modification
   * but still can track whether the file contributed changes and thus the route tree file needs to be regenerated.
   * After all files are processed, we swap the shadow cache with the main cache and initialize a new shadow cache.
   * That way we also ensure deleted/renamed files don't stay in the cache forever.
   */
  private routeNodeCache: GeneratorRouteNodeCache = new Map()
  private routeNodeShadowCache: GeneratorRouteNodeCache = new Map()

  private routeTreeFileCache: GeneratorCacheEntry | undefined

  public config: Config
  public targetTemplate: TargetTemplate

  private root: string
  private routesDirectoryPath: string
  private sessionId?: string
  private fs: fs
  private logger: Logger
  private generatedRouteTreePath: string
  private runPromise: Promise<void> | undefined
  private fileEventQueue: Array<GeneratorEvent> = []
  private plugins: Array<GeneratorPlugin> = [defaultGeneratorPlugin()]
  private pluginsWithTransform: Array<GeneratorPluginWithTransform> = []
  // this is just a cache for the transform plugins since we need them for each route file that is to be processed
  private transformPlugins: Array<TransformPlugin> = []
  private routeGroupPatternRegex = /\(.+\)/g
  private physicalDirectories: Array<string> = []

  constructor(opts: { config: Config; root: string; fs?: fs }) {
    this.config = opts.config
    this.logger = logging({ disabled: this.config.disableLogging })
    this.root = opts.root
    this.fs = opts.fs || DefaultFileSystem
    this.generatedRouteTreePath = path.resolve(this.config.generatedRouteTree)
    this.targetTemplate = getTargetTemplate(this.config)

    this.routesDirectoryPath = this.getRoutesDirectoryPath()
    this.plugins.push(...(opts.config.plugins || []))
    this.plugins.forEach((plugin) => {
      if ('transformPlugin' in plugin) {
        if (this.pluginsWithTransform.find((p) => p.name === plugin.name)) {
          throw new Error(
            `Plugin with name "${plugin.name}" is already registered for export ${plugin.transformPlugin.exportName}!`,
          )
        }
        this.pluginsWithTransform.push(plugin)
        this.transformPlugins.push(plugin.transformPlugin)
      }
    })
  }

  private getRoutesDirectoryPath() {
    return path.isAbsolute(this.config.routesDirectory)
      ? this.config.routesDirectory
      : path.resolve(this.root, this.config.routesDirectory)
  }

  public getRoutesByFileMap(): GetRoutesByFileMapResult {
    return new Map(
      [...this.routeNodeCache.entries()].map(([filePath, cacheEntry]) => [
        filePath,
        { routePath: cacheEntry.routeId },
      ]),
    )
  }

  public async run(event?: GeneratorEvent): Promise<void> {
    if (
      event &&
      event.type !== 'rerun' &&
      !this.isFileRelevantForRouteTreeGeneration(event.path)
    ) {
      return
    }
    this.fileEventQueue.push(event ?? { type: 'rerun' })
    // only allow a single run at a time
    if (this.runPromise) {
      return this.runPromise
    }

    this.runPromise = (async () => {
      do {
        // synchronously copy and clear the queue since we are going to iterate asynchronously over it
        // and while we do so, a new event could be put into the queue
        const tempQueue = this.fileEventQueue
        this.fileEventQueue = []
        // if we only have 'update' events in the queue
        // and we already have the affected files' latest state in our cache, we can exit early
        const remainingEvents = (
          await Promise.all(
            tempQueue.map(async (e) => {
              if (e.type === 'update') {
                let cacheEntry: GeneratorCacheEntry | undefined
                if (e.path === this.generatedRouteTreePath) {
                  cacheEntry = this.routeTreeFileCache
                } else {
                  // we only check the routeNodeCache here
                  // if the file's state is only up-to-date in the shadow cache we need to re-run
                  cacheEntry = this.routeNodeCache.get(e.path)
                }
                const change = await this.didFileChangeComparedToCache(
                  { path: e.path },
                  cacheEntry,
                )
                if (change.result === false) {
                  return null
                }
              }
              return e
            }),
          )
        ).filter((e) => e !== null)

        if (remainingEvents.length === 0) {
          break
        }

        try {
          const start = performance.now()
          await this.generatorInternal()
          const end = performance.now()
          this.logger.info(
            `Generated route tree in ${Math.round(end - start)}ms`,
          )
        } catch (err) {
          const errArray = !Array.isArray(err) ? [err] : err

          const recoverableErrors = errArray.filter((e) => isRerun(e))
          if (recoverableErrors.length === errArray.length) {
            this.fileEventQueue.push(...recoverableErrors.map((e) => e.event))
            recoverableErrors.forEach((e) => {
              if (e.msg) {
                this.logger.info(e.msg)
              }
            })
          } else {
            const unrecoverableErrors = errArray.filter((e) => !isRerun(e))
            this.runPromise = undefined
            throw new Error(
              unrecoverableErrors.map((e) => (e as Error).message).join(),
            )
          }
        }
      } while (this.fileEventQueue.length)
      this.runPromise = undefined
    })()
    return this.runPromise
  }

  private async generatorInternal() {
    let writeRouteTreeFile: boolean | 'force' = false

    let getRouteNodesResult: GetRouteNodesResult

    if (this.config.virtualRouteConfig) {
      getRouteNodesResult = await virtualGetRouteNodes(this.config, this.root)
    } else {
      getRouteNodesResult = await physicalGetRouteNodes(this.config, this.root)
    }

    const {
      rootRouteNode,
      routeNodes: beforeRouteNodes,
      physicalDirectories,
    } = getRouteNodesResult
    if (rootRouteNode === undefined) {
      let errorMessage = `rootRouteNode must not be undefined. Make sure you've added your root route into the route-tree.`
      if (!this.config.virtualRouteConfig) {
        errorMessage += `\nMake sure that you add a "${rootPathId}.${this.config.disableTypes ? 'js' : 'tsx'}" file to your routes directory.\nAdd the file in: "${this.config.routesDirectory}/${rootPathId}.${this.config.disableTypes ? 'js' : 'tsx'}"`
      }
      throw new Error(errorMessage)
    }
    this.physicalDirectories = physicalDirectories

    writeRouteTreeFile = await this.handleRootNode(rootRouteNode)

    const preRouteNodes = multiSortBy(beforeRouteNodes, [
      (d) => (d.routePath === '/' ? -1 : 1),
      (d) => d.routePath?.split('/').length,
      (d) =>
        d.filePath.match(new RegExp(`[./]${this.config.indexToken}[.]`))
          ? 1
          : -1,
      (d) =>
        d.filePath.match(
          /[./](component|errorComponent|pendingComponent|loader|lazy)[.]/,
        )
          ? 1
          : -1,
      (d) =>
        d.filePath.match(new RegExp(`[./]${this.config.routeToken}[.]`))
          ? -1
          : 1,
      (d) => (d.routePath?.endsWith('/') ? -1 : 1),
      (d) => d.routePath,
    ]).filter((d) => ![`/${rootPathId}`].includes(d.routePath || ''))

    const routeFileAllResult = await Promise.allSettled(
      preRouteNodes
        // only process routes that are backed by an actual file
        .filter((n) => !n.isVirtualParentRoute && !n.isVirtual)
        .map((n) => this.processRouteNodeFile(n)),
    )

    const rejections = routeFileAllResult.filter(
      (result) => result.status === 'rejected',
    )
    if (rejections.length > 0) {
      throw rejections.map((e) => e.reason)
    }

    const routeFileResult = routeFileAllResult.flatMap((result) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        return result.value
      }
      return []
    })

    routeFileResult.forEach((result) => {
      if (!result.node.exports?.length) {
        this.logger.warn(
          `Route file "${result.cacheEntry.fileContent}" does not export any route piece. This is likely a mistake.`,
        )
      }
    })
    if (routeFileResult.find((r) => r.shouldWriteTree)) {
      writeRouteTreeFile = true
    }

    // this is the first time the generator runs, so read in the route tree file if it exists yet
    if (!this.routeTreeFileCache) {
      const routeTreeFile = await this.fs.readFile(this.generatedRouteTreePath)
      if (routeTreeFile !== 'file-not-existing') {
        this.routeTreeFileCache = {
          fileContent: routeTreeFile.fileContent,
          mtimeMs: routeTreeFile.stat.mtimeMs,
        }
      }
      writeRouteTreeFile = true
    } else {
      const routeTreeFileChange = await this.didFileChangeComparedToCache(
        { path: this.generatedRouteTreePath },
        this.routeTreeFileCache,
      )
      if (routeTreeFileChange.result !== false) {
        writeRouteTreeFile = 'force'
        if (routeTreeFileChange.result === true) {
          const routeTreeFile = await this.fs.readFile(
            this.generatedRouteTreePath,
          )
          if (routeTreeFile !== 'file-not-existing') {
            this.routeTreeFileCache = {
              fileContent: routeTreeFile.fileContent,
              mtimeMs: routeTreeFile.stat.mtimeMs,
            }
          }
        }
      }
    }

    if (!writeRouteTreeFile) {
      // only needs to be done if no other changes have been detected yet
      // compare shadowCache and cache to identify deleted routes
      for (const fullPath of this.routeNodeCache.keys()) {
        if (!this.routeNodeShadowCache.has(fullPath)) {
          writeRouteTreeFile = true
          break
        }
      }
    }

    if (!writeRouteTreeFile) {
      this.swapCaches()
      return
    }

    let routeTreeContent = this.buildRouteTreeFileContent(
      rootRouteNode,
      preRouteNodes,
      routeFileResult,
    )
    routeTreeContent = this.config.enableRouteTreeFormatting
      ? await format(routeTreeContent, this.config)
      : routeTreeContent

    let newMtimeMs: bigint | undefined
    if (this.routeTreeFileCache) {
      if (
        writeRouteTreeFile !== 'force' &&
        this.routeTreeFileCache.fileContent === routeTreeContent
      ) {
        // existing route tree file is already up-to-date, don't write it
        // we should only get here in the initial run when the route cache is not filled yet
      } else {
        const newRouteTreeFileStat = await this.safeFileWrite({
          filePath: this.generatedRouteTreePath,
          newContent: routeTreeContent,
          strategy: {
            type: 'mtime',
            expectedMtimeMs: this.routeTreeFileCache.mtimeMs,
          },
        })
        newMtimeMs = newRouteTreeFileStat.mtimeMs
      }
    } else {
      const newRouteTreeFileStat = await this.safeFileWrite({
        filePath: this.generatedRouteTreePath,
        newContent: routeTreeContent,
        strategy: {
          type: 'new-file',
        },
      })
      newMtimeMs = newRouteTreeFileStat.mtimeMs
    }

    if (newMtimeMs !== undefined) {
      this.routeTreeFileCache = {
        fileContent: routeTreeContent,
        mtimeMs: newMtimeMs,
      }
    }

    this.swapCaches()
  }

  private swapCaches() {
    this.routeNodeCache = this.routeNodeShadowCache
    this.routeNodeShadowCache = new Map()
  }

  private buildRouteTreeFileContent(
    rootRouteNode: RouteNode,
    preRouteNodes: Array<RouteNode>,
    routeFileResult: Array<{
      cacheEntry: RouteNodeCacheEntry
      node: RouteNode
    }>,
  ) {
    const getImportForRouteNode = (node: RouteNode, exportName: string) => {
      if (node.exports?.includes(exportName)) {
        return {
          source: `./${this.getImportPath(node)}`,
          specifiers: [
            {
              imported: exportName,
              local: `${node.variableName}${exportName}Import`,
            },
          ],
        } satisfies ImportDeclaration
      }
      return undefined
    }

    const buildRouteTreeForExport = (plugin: GeneratorPluginWithTransform) => {
      const exportName = plugin.transformPlugin.exportName
      const acc: HandleNodeAccumulator = {
        routeTree: [],
        routeNodes: [],
        routePiecesByPath: {},
      }
      for (const node of preRouteNodes) {
        if (node.exports?.includes(plugin.transformPlugin.exportName)) {
          this.handleNode(node, acc)
        }
      }

      const sortedRouteNodes = multiSortBy(acc.routeNodes, [
        (d) => (d.routePath?.includes(`/${rootPathId}`) ? -1 : 1),
        (d) => d.routePath?.split('/').length,
        (d) => (d.routePath?.endsWith(this.config.indexToken) ? -1 : 1),
        (d) => d,
      ])

      const pluginConfig = plugin.config({
        generator: this,
        rootRouteNode,
        sortedRouteNodes,
      })

      const routeImports = sortedRouteNodes
        .filter((d) => !d.isVirtual)
        .flatMap((node) => getImportForRouteNode(node, exportName) ?? [])

      const hasMatchingRouteFiles =
        acc.routeNodes.length > 0 || rootRouteNode.exports?.includes(exportName)

      const virtualRouteNodes = sortedRouteNodes
        .filter((d) => d.isVirtual)
        .map((node) => {
          return `const ${
            node.variableName
          }${exportName}Import = ${plugin.createVirtualRouteCode({ node })}`
        })
      if (
        !rootRouteNode.exports?.includes(exportName) &&
        pluginConfig.virtualRootRoute
      ) {
        virtualRouteNodes.unshift(
          `const ${rootRouteNode.variableName}${exportName}Import = ${plugin.createRootRouteCode()}`,
        )
      }

      const imports = plugin.imports({
        sortedRouteNodes,
        acc,
        generator: this,
        rootRouteNode,
      })

      const routeTreeConfig = buildRouteTreeConfig(
        acc.routeTree,
        exportName,
        this.config.disableTypes,
      )

      const createUpdateRoutes = sortedRouteNodes.map((node) => {
        const loaderNode = acc.routePiecesByPath[node.routePath!]?.loader
        const componentNode = acc.routePiecesByPath[node.routePath!]?.component
        const errorComponentNode =
          acc.routePiecesByPath[node.routePath!]?.errorComponent
        const pendingComponentNode =
          acc.routePiecesByPath[node.routePath!]?.pendingComponent
        const lazyComponentNode = acc.routePiecesByPath[node.routePath!]?.lazy

        return [
          [
            `const ${node.variableName}${exportName} = ${node.variableName}${exportName}Import.update({
            ${[
              `id: '${node.path}'`,
              !node.isNonPath ? `path: '${node.cleanedPath}'` : undefined,
              `getParentRoute: () => ${findParent(node, exportName)}`,
            ]
              .filter(Boolean)
              .join(',')}
          }${this.config.disableTypes ? '' : 'as any'})`,
            loaderNode
              ? `.updateLoader({ loader: lazyFn(() => import('./${replaceBackslash(
                  removeExt(
                    path.relative(
                      path.dirname(this.config.generatedRouteTree),
                      path.resolve(
                        this.config.routesDirectory,
                        loaderNode.filePath,
                      ),
                    ),
                    this.config.addExtensions,
                  ),
                )}'), 'loader') })`
              : '',
            componentNode || errorComponentNode || pendingComponentNode
              ? `.update({
                ${(
                  [
                    ['component', componentNode],
                    ['errorComponent', errorComponentNode],
                    ['pendingComponent', pendingComponentNode],
                  ] as const
                )
                  .filter((d) => d[1])
                  .map((d) => {
                    return `${
                      d[0]
                    }: lazyRouteComponent(() => import('./${replaceBackslash(
                      removeExt(
                        path.relative(
                          path.dirname(this.config.generatedRouteTree),
                          path.resolve(
                            this.config.routesDirectory,
                            d[1]!.filePath,
                          ),
                        ),
                        this.config.addExtensions,
                      ),
                    )}'), '${d[0]}')`
                  })
                  .join('\n,')}
              })`
              : '',
            lazyComponentNode
              ? `.lazy(() => import('./${replaceBackslash(
                  removeExt(
                    path.relative(
                      path.dirname(this.config.generatedRouteTree),
                      path.resolve(
                        this.config.routesDirectory,
                        lazyComponentNode.filePath,
                      ),
                    ),
                    this.config.addExtensions,
                  ),
                )}').then((d) => d.${exportName}))`
              : '',
          ].join(''),
        ].join('\n\n')
      })

      let fileRoutesByPathInterfacePerPlugin = ''
      let fileRoutesByFullPathPerPlugin = ''

      if (!this.config.disableTypes && hasMatchingRouteFiles) {
        fileRoutesByFullPathPerPlugin = [
          `export interface File${exportName}sByFullPath {
${[...createRouteNodesByFullPath(acc.routeNodes).entries()]
  .filter(([fullPath]) => fullPath)
  .map(([fullPath, routeNode]) => {
    return `'${fullPath}': typeof ${getResolvedRouteNodeVariableName(routeNode, exportName)}`
  })}
}`,
          `export interface File${exportName}sByTo {
${[...createRouteNodesByTo(acc.routeNodes).entries()]
  .filter(([to]) => to)
  .map(([to, routeNode]) => {
    return `'${to}': typeof ${getResolvedRouteNodeVariableName(routeNode, exportName)}`
  })}
}`,
          `export interface File${exportName}sById {
'${rootRouteId}': typeof root${exportName}Import,
${[...createRouteNodesById(acc.routeNodes).entries()].map(([id, routeNode]) => {
  return `'${id}': typeof ${getResolvedRouteNodeVariableName(routeNode, exportName)}`
})}
}`,
          `export interface File${exportName}Types {
file${exportName}sByFullPath: File${exportName}sByFullPath
fullPaths: ${
            acc.routeNodes.length > 0
              ? [...createRouteNodesByFullPath(acc.routeNodes).keys()]
                  .filter((fullPath) => fullPath)
                  .map((fullPath) => `'${fullPath}'`)
                  .join('|')
              : 'never'
          }
file${exportName}sByTo: File${exportName}sByTo
to: ${
            acc.routeNodes.length > 0
              ? [...createRouteNodesByTo(acc.routeNodes).keys()]
                  .filter((to) => to)
                  .map((to) => `'${to}'`)
                  .join('|')
              : 'never'
          }
id: ${[`'${rootRouteId}'`, ...[...createRouteNodesById(acc.routeNodes).keys()].map((id) => `'${id}'`)].join('|')}
file${exportName}sById: File${exportName}sById
}`,
          `export interface Root${exportName}Children {
${acc.routeTree.map((child) => `${child.variableName}${exportName}: typeof ${getResolvedRouteNodeVariableName(child, exportName)}`).join(',')}
}`,
        ].join('\n')

        fileRoutesByPathInterfacePerPlugin = buildFileRoutesByPathInterface({
          ...plugin.moduleAugmentation({ generator: this }),
          routeNodes:
            this.config.verboseFileRoutes !== false
              ? sortedRouteNodes
              : [
                  ...routeFileResult.map(({ node }) => node),
                  ...sortedRouteNodes.filter((d) => d.isVirtual),
                ],
          exportName,
        })
      }

      let routeTree = ''
      if (hasMatchingRouteFiles) {
        routeTree = [
          `const root${exportName}Children${this.config.disableTypes ? '' : `: Root${exportName}Children`} = {
  ${acc.routeTree
    .map(
      (child) =>
        `${child.variableName}${exportName}: ${getResolvedRouteNodeVariableName(child, exportName)}`,
    )
    .join(',')}
}`,
          `export const ${lowerCaseFirstChar(exportName)}Tree = root${exportName}Import._addFileChildren(root${exportName}Children)${this.config.disableTypes ? '' : `._addFileTypes<File${exportName}Types>()`}`,
        ].join('\n')
      }

      return {
        routeImports,
        sortedRouteNodes,
        acc,
        virtualRouteNodes,
        routeTreeConfig,
        routeTree,
        imports,
        createUpdateRoutes,
        fileRoutesByFullPathPerPlugin,
        fileRoutesByPathInterfacePerPlugin,
      }
    }

    const routeTrees = this.pluginsWithTransform.map((plugin) => ({
      exportName: plugin.transformPlugin.exportName,
      ...buildRouteTreeForExport(plugin),
    }))

    this.plugins.map((plugin) => {
      return plugin.onRouteTreesChanged?.({
        routeTrees,
        rootRouteNode,
        generator: this,
      })
    })

    let mergedImports = mergeImportDeclarations(
      routeTrees.flatMap((d) => d.imports),
    )
    if (this.config.disableTypes) {
      mergedImports = mergedImports.filter((d) => d.importKind !== 'type')
    }

    const importStatements = mergedImports.map(buildImportString)

    let moduleAugmentation = ''
    if (this.config.verboseFileRoutes === false && !this.config.disableTypes) {
      moduleAugmentation = routeFileResult
        .map(({ node }) => {
          const getModuleDeclaration = (routeNode?: RouteNode) => {
            if (!isRouteNodeValidForAugmentation(routeNode)) {
              return ''
            }
            const moduleAugmentation = this.pluginsWithTransform
              .map((plugin) => {
                return plugin.routeModuleAugmentation({
                  routeNode,
                })
              })
              .filter(Boolean)
              .join('\n')

            return `declare module './${this.getImportPath(routeNode)}' {
                      ${moduleAugmentation}
                    }`
          }
          return getModuleDeclaration(node)
        })
        .join('\n')
    }

    const routeImports = routeTrees.flatMap((t) => t.routeImports)
    const rootRouteImports = this.pluginsWithTransform.flatMap(
      (p) =>
        getImportForRouteNode(rootRouteNode, p.transformPlugin.exportName) ??
        [],
    )
    if (rootRouteImports.length > 0) {
      routeImports.unshift(...rootRouteImports)
    }
    const routeTreeContent = [
      ...this.config.routeTreeFileHeader,
      `// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.`,
      [...importStatements].join('\n'),
      mergeImportDeclarations(routeImports).map(buildImportString).join('\n'),
      routeTrees.flatMap((t) => t.virtualRouteNodes).join('\n'),
      routeTrees.flatMap((t) => t.createUpdateRoutes).join('\n'),

      routeTrees.map((t) => t.fileRoutesByFullPathPerPlugin).join('\n'),
      routeTrees.map((t) => t.fileRoutesByPathInterfacePerPlugin).join('\n'),
      moduleAugmentation,
      routeTrees.flatMap((t) => t.routeTreeConfig).join('\n'),
      routeTrees.map((t) => t.routeTree).join('\n'),
      ...this.config.routeTreeFileFooter,
    ]
      .filter(Boolean)
      .join('\n\n')
    return routeTreeContent
  }

  private getImportPath(node: RouteNode) {
    return replaceBackslash(
      removeExt(
        path.relative(
          path.dirname(this.config.generatedRouteTree),
          path.resolve(this.config.routesDirectory, node.filePath),
        ),
        this.config.addExtensions,
      ),
    )
  }

  private async processRouteNodeFile(node: RouteNode): Promise<{
    shouldWriteTree: boolean
    cacheEntry: RouteNodeCacheEntry
    node: RouteNode
  } | null> {
    const result = await this.isRouteFileCacheFresh(node)

    if (result.status === 'fresh') {
      node.exports = result.cacheEntry.exports
      return {
        node,
        shouldWriteTree: result.exportsChanged,
        cacheEntry: result.cacheEntry,
      }
    }

    const existingRouteFile = await this.fs.readFile(node.fullPath)
    if (existingRouteFile === 'file-not-existing') {
      throw new Error(`⚠️ File ${node.fullPath} does not exist`)
    }

    const updatedCacheEntry: RouteNodeCacheEntry = {
      fileContent: existingRouteFile.fileContent,
      mtimeMs: existingRouteFile.stat.mtimeMs,
      exports: [],
      routeId: node.routePath ?? '$$TSR_NO_ROUTE_PATH_ASSIGNED$$',
    }

    const escapedRoutePath = node.routePath?.replaceAll('$', '$$') ?? ''

    let shouldWriteRouteFile = false
    // now we need to either scaffold the file or transform it
    if (!existingRouteFile.fileContent) {
      shouldWriteRouteFile = true
      // Creating a new lazy route file
      if (node._fsRouteType === 'lazy') {
        const tLazyRouteTemplate = this.targetTemplate.lazyRoute
        // Check by default check if the user has a specific lazy route template
        // If not, check if the user has a route template and use that instead
        updatedCacheEntry.fileContent = await fillTemplate(
          this.config,
          (this.config.customScaffolding?.lazyRouteTemplate ||
            this.config.customScaffolding?.routeTemplate) ??
            tLazyRouteTemplate.template(),
          {
            tsrImports: tLazyRouteTemplate.imports.tsrImports(),
            tsrPath: escapedRoutePath.replaceAll(/\{(.+?)\}/gm, '$1'),
            tsrExportStart:
              tLazyRouteTemplate.imports.tsrExportStart(escapedRoutePath),
            tsrExportEnd: tLazyRouteTemplate.imports.tsrExportEnd(),
          },
        )
        updatedCacheEntry.exports = ['Route']
      } else if (
        // Creating a new normal route file
        (['layout', 'static'] satisfies Array<FsRouteType>).some(
          (d) => d === node._fsRouteType,
        ) ||
        (
          [
            'component',
            'pendingComponent',
            'errorComponent',
            'loader',
          ] satisfies Array<FsRouteType>
        ).every((d) => d !== node._fsRouteType)
      ) {
        const tRouteTemplate = this.targetTemplate.route
        updatedCacheEntry.fileContent = await fillTemplate(
          this.config,
          this.config.customScaffolding?.routeTemplate ??
            tRouteTemplate.template(),
          {
            tsrImports: tRouteTemplate.imports.tsrImports(),
            tsrPath: escapedRoutePath.replaceAll(/\{(.+?)\}/gm, '$1'),
            tsrExportStart:
              tRouteTemplate.imports.tsrExportStart(escapedRoutePath),
            tsrExportEnd: tRouteTemplate.imports.tsrExportEnd(),
          },
        )
        updatedCacheEntry.exports = ['Route']
      } else {
        return null
      }
    } else {
      // transform the file
      const transformResult = await transform({
        source: updatedCacheEntry.fileContent,
        ctx: {
          target: this.config.target,
          routeId: escapedRoutePath,
          lazy: node._fsRouteType === 'lazy',
          verboseFileRoutes: !(this.config.verboseFileRoutes === false),
        },
        plugins: this.transformPlugins,
      })

      if (transformResult.result === 'error') {
        throw new Error(
          `Error transforming route file ${node.fullPath}: ${transformResult.error}`,
        )
      }
      updatedCacheEntry.exports = transformResult.exports
      if (transformResult.result === 'modified') {
        updatedCacheEntry.fileContent = transformResult.output
        shouldWriteRouteFile = true
      }
    }

    // file was changed
    if (shouldWriteRouteFile) {
      const stats = await this.safeFileWrite({
        filePath: node.fullPath,
        newContent: updatedCacheEntry.fileContent,
        strategy: {
          type: 'mtime',
          expectedMtimeMs: updatedCacheEntry.mtimeMs,
        },
      })
      updatedCacheEntry.mtimeMs = stats.mtimeMs
    }

    this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry)
    node.exports = updatedCacheEntry.exports
    const shouldWriteTree = !deepEqual(
      result.cacheEntry?.exports,
      updatedCacheEntry.exports,
    )
    return {
      node,
      shouldWriteTree,
      cacheEntry: updatedCacheEntry,
    }
  }

  private async didRouteFileChangeComparedToCache(
    file: {
      path: string
      mtimeMs?: bigint
    },
    cache: 'routeNodeCache' | 'routeNodeShadowCache',
  ): Promise<FileCacheChange<RouteNodeCacheEntry>> {
    const cacheEntry = this[cache].get(file.path)
    return this.didFileChangeComparedToCache(file, cacheEntry)
  }

  private async didFileChangeComparedToCache<
    TCacheEntry extends GeneratorCacheEntry,
  >(
    file: {
      path: string
      mtimeMs?: bigint
    },
    cacheEntry: TCacheEntry | undefined,
  ): Promise<FileCacheChange<TCacheEntry>> {
    // for now we rely on the modification time of the file
    // to determine if the file has changed
    // we could also compare the file content but this would be slower as we would have to read the file

    if (!cacheEntry) {
      return { result: 'file-not-in-cache' }
    }
    let mtimeMs = file.mtimeMs

    if (mtimeMs === undefined) {
      try {
        const currentStat = await this.fs.stat(file.path)
        mtimeMs = currentStat.mtimeMs
      } catch {
        return { result: 'cannot-stat-file' }
      }
    }
    return { result: mtimeMs !== cacheEntry.mtimeMs, mtimeMs, cacheEntry }
  }

  private async safeFileWrite(opts: {
    filePath: string
    newContent: string
    strategy:
      | {
          type: 'mtime'
          expectedMtimeMs: bigint
        }
      | {
          type: 'new-file'
        }
  }) {
    const tmpPath = this.getTempFileName(opts.filePath)
    await this.fs.writeFile(tmpPath, opts.newContent)

    if (opts.strategy.type === 'mtime') {
      const beforeStat = await this.fs.stat(opts.filePath)
      if (beforeStat.mtimeMs !== opts.strategy.expectedMtimeMs) {
        throw rerun({
          msg: `File ${opts.filePath} was modified by another process during processing.`,
          event: { type: 'update', path: opts.filePath },
        })
      }
      const newFileState = await this.fs.stat(tmpPath)
      if (newFileState.mode !== beforeStat.mode) {
        await this.fs.chmod(tmpPath, beforeStat.mode)
      }
      if (
        newFileState.uid !== beforeStat.uid ||
        newFileState.gid !== beforeStat.gid
      ) {
        try {
          await this.fs.chown(tmpPath, beforeStat.uid, beforeStat.gid)
        } catch (err) {
          if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as any).code === 'EPERM'
          ) {
            console.warn(
              `[safeFileWrite] chown failed: ${(err as any).message}`,
            )
          } else {
            throw err
          }
        }
      }
    } else {
      if (await checkFileExists(opts.filePath)) {
        throw rerun({
          msg: `File ${opts.filePath} already exists. Cannot overwrite.`,
          event: { type: 'update', path: opts.filePath },
        })
      }
    }

    const stat = await this.fs.stat(tmpPath)

    await this.fs.rename(tmpPath, opts.filePath)

    return stat
  }

  private getTempFileName(filePath: string) {
    const absPath = path.resolve(filePath)
    const hash = crypto.createHash('md5').update(absPath).digest('hex')
    // lazy initialize sessionId to only create tmpDir when it is first needed
    if (!this.sessionId) {
      // ensure the directory exists
      mkdirSync(this.config.tmpDir, { recursive: true })
      this.sessionId = crypto.randomBytes(4).toString('hex')
    }
    return path.join(this.config.tmpDir, `${this.sessionId}-${hash}`)
  }

  private async isRouteFileCacheFresh(node: RouteNode): Promise<
    | {
        status: 'fresh'
        cacheEntry: RouteNodeCacheEntry
        exportsChanged: boolean
      }
    | { status: 'stale'; cacheEntry?: RouteNodeCacheEntry }
  > {
    const fileChangedCache = await this.didRouteFileChangeComparedToCache(
      { path: node.fullPath },
      'routeNodeCache',
    )
    if (fileChangedCache.result === false) {
      this.routeNodeShadowCache.set(node.fullPath, fileChangedCache.cacheEntry)
      return {
        status: 'fresh',
        exportsChanged: false,
        cacheEntry: fileChangedCache.cacheEntry,
      }
    }
    if (fileChangedCache.result === 'cannot-stat-file') {
      throw new Error(`⚠️ expected route file to exist at ${node.fullPath}`)
    }
    const mtimeMs =
      fileChangedCache.result === true ? fileChangedCache.mtimeMs : undefined

    const shadowCacheFileChange = await this.didRouteFileChangeComparedToCache(
      { path: node.fullPath, mtimeMs },
      'routeNodeShadowCache',
    )

    if (shadowCacheFileChange.result === 'cannot-stat-file') {
      throw new Error(`⚠️ expected route file to exist at ${node.fullPath}`)
    }

    if (shadowCacheFileChange.result === false) {
      // shadow cache has latest file state already
      // compare shadowCache against cache to determine whether exports changed
      // if they didn't, cache is fresh
      if (fileChangedCache.result === true) {
        if (
          deepEqual(
            fileChangedCache.cacheEntry.exports,
            shadowCacheFileChange.cacheEntry.exports,
          )
        ) {
          return {
            status: 'fresh',
            exportsChanged: false,
            cacheEntry: shadowCacheFileChange.cacheEntry,
          }
        }
        return {
          status: 'fresh',
          exportsChanged: true,
          cacheEntry: shadowCacheFileChange.cacheEntry,
        }
      }
    }

    if (fileChangedCache.result === 'file-not-in-cache') {
      return {
        status: 'stale',
      }
    }
    return { status: 'stale', cacheEntry: fileChangedCache.cacheEntry }
  }

  private async handleRootNode(node: RouteNode) {
    const result = await this.isRouteFileCacheFresh(node)

    if (result.status === 'fresh') {
      node.exports = result.cacheEntry.exports
      this.routeNodeShadowCache.set(node.fullPath, result.cacheEntry)
      return result.exportsChanged
    }
    const rootNodeFile = await this.fs.readFile(node.fullPath)
    if (rootNodeFile === 'file-not-existing') {
      throw new Error(`⚠️ expected root route to exist at ${node.fullPath}`)
    }

    const updatedCacheEntry: RouteNodeCacheEntry = {
      fileContent: rootNodeFile.fileContent,
      mtimeMs: rootNodeFile.stat.mtimeMs,
      exports: [],
      routeId: node.routePath ?? '$$TSR_NO_ROOT_ROUTE_PATH_ASSIGNED$$',
    }

    // scaffold the root route
    if (!rootNodeFile.fileContent) {
      const rootTemplate = this.targetTemplate.rootRoute
      const rootRouteContent = await fillTemplate(
        this.config,
        rootTemplate.template(),
        {
          tsrImports: rootTemplate.imports.tsrImports(),
          tsrPath: rootPathId,
          tsrExportStart: rootTemplate.imports.tsrExportStart(),
          tsrExportEnd: rootTemplate.imports.tsrExportEnd(),
        },
      )

      this.logger.log(`🟡 Creating ${node.fullPath}`)
      const stats = await this.safeFileWrite({
        filePath: node.fullPath,
        newContent: rootRouteContent,
        strategy: {
          type: 'mtime',
          expectedMtimeMs: rootNodeFile.stat.mtimeMs,
        },
      })
      updatedCacheEntry.fileContent = rootRouteContent
      updatedCacheEntry.mtimeMs = stats.mtimeMs
    }

    const rootRouteExports: Array<string> = []
    for (const plugin of this.pluginsWithTransform) {
      const exportName = plugin.transformPlugin.exportName
      // TODO we need to parse instead of just string match
      // otherwise a commented out export will still be detected
      if (rootNodeFile.fileContent.includes(`export const ${exportName}`)) {
        rootRouteExports.push(exportName)
      }
    }

    updatedCacheEntry.exports = rootRouteExports
    node.exports = rootRouteExports
    this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry)

    const shouldWriteTree = !deepEqual(
      result.cacheEntry?.exports,
      rootRouteExports,
    )
    return shouldWriteTree
  }

  private handleNode(node: RouteNode, acc: HandleNodeAccumulator) {
    // Do not remove this as we need to set the lastIndex to 0 as it
    // is necessary to reset the regex's index when using the global flag
    // otherwise it might not match the next time it's used
    resetRegex(this.routeGroupPatternRegex)

    let parentRoute = hasParentRoute(acc.routeNodes, node, node.routePath)

    // if the parent route is a virtual parent route, we need to find the real parent route
    if (parentRoute?.isVirtualParentRoute && parentRoute.children?.length) {
      // only if this sub-parent route returns a valid parent route, we use it, if not leave it as it
      const possibleParentRoute = hasParentRoute(
        parentRoute.children,
        node,
        node.routePath,
      )
      if (possibleParentRoute) {
        parentRoute = possibleParentRoute
      }
    }

    if (parentRoute) node.parent = parentRoute

    node.path = determineNodePath(node)

    const trimmedPath = trimPathLeft(node.path ?? '')

    const split = trimmedPath.split('/')
    const lastRouteSegment = split[split.length - 1] ?? trimmedPath

    node.isNonPath =
      lastRouteSegment.startsWith('_') ||
      split.every((part) => this.routeGroupPatternRegex.test(part))

    node.cleanedPath = removeGroups(
      removeUnderscores(removeLayoutSegments(node.path)) ?? '',
    )

    if (
      !node.isVirtual &&
      (
        [
          'lazy',
          'loader',
          'component',
          'pendingComponent',
          'errorComponent',
        ] satisfies Array<FsRouteType>
      ).some((d) => d === node._fsRouteType)
    ) {
      acc.routePiecesByPath[node.routePath!] =
        acc.routePiecesByPath[node.routePath!] || {}

      acc.routePiecesByPath[node.routePath!]![
        node._fsRouteType === 'lazy'
          ? 'lazy'
          : node._fsRouteType === 'loader'
            ? 'loader'
            : node._fsRouteType === 'errorComponent'
              ? 'errorComponent'
              : node._fsRouteType === 'pendingComponent'
                ? 'pendingComponent'
                : 'component'
      ] = node

      const anchorRoute = acc.routeNodes.find(
        (d) => d.routePath === node.routePath,
      )

      if (!anchorRoute) {
        this.handleNode(
          {
            ...node,
            isVirtual: true,
            _fsRouteType: 'static',
          },
          acc,
        )
      }
      return
    }

    const cleanedPathIsEmpty = (node.cleanedPath || '').length === 0
    const nonPathRoute =
      node._fsRouteType === 'pathless_layout' && node.isNonPath

    node.isVirtualParentRequired =
      node._fsRouteType === 'pathless_layout' || nonPathRoute
        ? !cleanedPathIsEmpty
        : false

    if (!node.isVirtual && node.isVirtualParentRequired) {
      const parentRoutePath = removeLastSegmentFromPath(node.routePath) || '/'
      const parentVariableName = routePathToVariable(parentRoutePath)

      const anchorRoute = acc.routeNodes.find(
        (d) => d.routePath === parentRoutePath,
      )

      if (!anchorRoute) {
        const parentNode: RouteNode = {
          ...node,
          path: removeLastSegmentFromPath(node.path) || '/',
          filePath: removeLastSegmentFromPath(node.filePath) || '/',
          fullPath: removeLastSegmentFromPath(node.fullPath) || '/',
          routePath: parentRoutePath,
          variableName: parentVariableName,
          isVirtual: true,
          _fsRouteType: 'layout', // layout since this route will wrap other routes
          isVirtualParentRoute: true,
          isVirtualParentRequired: false,
        }

        parentNode.children = parentNode.children ?? []
        parentNode.children.push(node)

        node.parent = parentNode

        if (node._fsRouteType === 'pathless_layout') {
          // since `node.path` is used as the `id` on the route definition, we need to update it
          node.path = determineNodePath(node)
        }

        this.handleNode(parentNode, acc)
      } else {
        anchorRoute.children = anchorRoute.children ?? []
        anchorRoute.children.push(node)

        node.parent = anchorRoute
      }
    }

    if (node.parent) {
      if (!node.isVirtualParentRequired) {
        node.parent.children = node.parent.children ?? []
        node.parent.children.push(node)
      }
    } else {
      acc.routeTree.push(node)
    }

    acc.routeNodes.push(node)
  }

  // only process files that are relevant for the route tree generation
  private isFileRelevantForRouteTreeGeneration(filePath: string): boolean {
    // the generated route tree file
    if (filePath === this.generatedRouteTreePath) {
      return true
    }

    // files inside the routes folder
    if (filePath.startsWith(this.routesDirectoryPath)) {
      return true
    }

    // the virtual route config file passed into `virtualRouteConfig`
    if (
      typeof this.config.virtualRouteConfig === 'string' &&
      filePath === this.config.virtualRouteConfig
    ) {
      return true
    }

    // this covers all files that are mounted via `virtualRouteConfig` or any `__virtual.ts` files
    if (this.routeNodeCache.has(filePath)) {
      return true
    }

    // virtual config files such as`__virtual.ts`
    if (isVirtualConfigFile(path.basename(filePath))) {
      return true
    }

    // route files inside directories mounted via `physical()` inside a virtual route config
    if (this.physicalDirectories.some((dir) => filePath.startsWith(dir))) {
      return true
    }

    return false
  }
}
