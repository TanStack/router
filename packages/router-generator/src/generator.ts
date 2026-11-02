import path from 'node:path'
import * as fsp from 'node:fs/promises'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import crypto from 'node:crypto'
import { rootRouteId } from '@tanstack/router-core'
import {
  getParamNames,
  parseSegments,
} from '@tanstack/router-core/_internal/route-module'
import { logging } from './logger'
import {
  isVirtualConfigFile,
  getRouteNodes as physicalGetRouteNodes,
} from './filesystem/physical/getRouteNodes'
import { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes'
import { rootPathId } from './filesystem/physical/rootPathId'
import {
  RoutePrefixMap,
  buildFileRoutesByPathInterface,
  buildImportString,
  buildRouteTreeConfig,
  checkFileExists,
  checkRouteFullPathUniqueness,
  countRoutePathSegments,
  countSlashSeparatedParts,
  createRouteNodesByFullPath,
  createRouteNodesById,
  createRouteNodesByTo,
  createTokenRegex,
  determineNodePath,
  findParent,
  format,
  getImportForRouteNode,
  getResolvedRouteNodeVariableName,
  hasParentRoute,
  inferFullPath,
  isSegmentPathless,
  mergeImportDeclarations,
  multiSortBy,
  removeExt,
  removeGroups,
  removeLastSegmentFromPath,
  removeLayoutSegmentsAndUnderscoresWithEscape,
  removeTrailingSlash,
  replaceBackslash,
  sortRouteNodes,
  trimPathLeft,
} from './utils'
import { fillTemplate, getTargetTemplate } from './template'
import {
  getHostPath,
  getInstallationRouteId,
  resolveRouteModuleContext,
} from './route-module/context'
import {
  ROUTE_CONTRACT_FILE,
  ROUTE_MODULE_FILE,
  ROUTE_SCOPE_FILE,
  START_MODULES_FILE,
  buildRouteContractSource,
  buildRouteModuleSource,
  buildRouteNamespaceSource,
  buildRouteScopeSource,
  buildStartModulesSource,
  getModuleIdentifier,
  getMountVariableName,
  getRouteNamespaceFile,
} from './route-module/emit'
import {
  ROUTE_MODULE_MANIFEST_VERSION,
  computeTopologyToken,
  writeManifest,
} from './route-module/manifest'
import { findPackageRoot } from './route-module/declaration'
import { pruneServerOnlySubtrees } from './pruneServerOnlySubtrees'
import { isPrerenderableRoute } from './routeClassification'
import { transform } from './transform/transform'
import { validateRouteParams } from './validate-route-params'
import {
  allocateGeneratedNames,
  generatedPublicNames,
  moduleBindingSuffixes,
  routeBindingSuffixes,
} from './generated-names'
import { DEFAULT_ROUTE_TREE_FILE_HEADER } from './config'
import type { RouteModuleContext } from './route-module/context'
import type {
  ManifestInstalledModule,
  ManifestRoute,
  RouteModuleManifest,
} from './route-module/manifest'
import type { GeneratorPlugin } from './plugin/types'
import type { TargetTemplate } from './template'
import type {
  FsRouteType,
  GetRouteNodesResult,
  GetRoutesByFileMapResult,
  HandleNodeAccumulator,
  ImportDeclaration,
  RouteNode,
  RoutePathSegmentMetadata,
} from './types'
import type { Config } from './config'
import type { Logger } from './logger'

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

function getRoutePathSegmentMetadataForPath(
  node: RouteNode,
  routePath: string,
  parentRoutePath?: string,
): Array<RoutePathSegmentMetadata | undefined> | undefined {
  if (!node._routePathSegmentMetadata) return undefined

  const segments = routePath.split('/')
  const result = new Array<RoutePathSegmentMetadata | undefined>(
    segments.length,
  )
  const parentSegmentCount = countRoutePathSegments(parentRoutePath)
  let hasMetadata = false
  let segmentCount = 0

  for (let i = 0; i < segments.length; i++) {
    if (!segments[i]) continue
    const sourceIndex = parentSegmentCount + segmentCount + 1
    result[i] = node._routePathSegmentMetadata[sourceIndex]
    hasMetadata ||= !!result[i]
    segmentCount++
  }

  return hasMetadata ? result : undefined
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
  routeId: string
  node: RouteNode
}

type GeneratorRouteNodeCache = Map</** filePath **/ string, RouteNodeCacheEntry>

interface CrawlingResult {
  rootRouteNode: RouteNode
  routeFileResult: Array<RouteNode>
  acc: HandleNodeAccumulator
}

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

  private crawlingResult: CrawlingResult | undefined
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
  private plugins: Array<GeneratorPlugin> = []
  private static routeGroupPatternRegex = /\(.+\)/
  private physicalDirectories: Array<string> = []
  /** Route-module role of this package, refreshed on every run. */
  private routeModuleContext: RouteModuleContext | undefined
  private originalRouteNames = new WeakMap<RouteNode, string>()
  /** Files that change the route-module context (package.json, manifests). */
  private routeModuleFiles: Array<string> = []

  /**
   * Token regexes are pre-compiled once here and reused throughout route processing.
   * We need TWO types of regex for each token because they match against different inputs:
   *
   * 1. FILENAME regexes: Match token patterns within full file path strings.
   *    Example: For file "routes/dashboard.index.tsx", we want to detect ".index."
   *    Pattern: `[./](?:token)[.]` - matches token bounded by path separators/dots
   *    Used in: sorting route nodes by file path
   *
   * 2. SEGMENT regexes: Match token against a single logical route segment.
   *    Example: For segment "index" (extracted from path), match the whole segment
   *    Pattern: `^(?:token)$` - matches entire segment exactly
   *    Used in: route parsing, determining route types, escape detection
   *
   * We cannot reuse one for the other without false positives or missing matches.
   */
  private indexTokenFilenameRegex: RegExp
  private routeTokenFilenameRegex: RegExp
  private indexTokenSegmentRegex: RegExp
  private routeTokenSegmentRegex: RegExp
  private static componentPieceRegex =
    /[./](component|errorComponent|notFoundComponent|pendingComponent|loader|lazy)[.]/

  constructor(opts: { config: Config; root: string; fs?: fs }) {
    this.config = opts.config
    this.logger = logging({ disabled: this.config.disableLogging })
    this.root = opts.root
    this.fs = opts.fs || DefaultFileSystem
    this.generatedRouteTreePath = this.getGeneratedRouteTreePath()
    this.targetTemplate = getTargetTemplate(this.config)

    this.routesDirectoryPath = this.getRoutesDirectoryPath()
    this.plugins.push(...(opts.config.plugins || []))

    // Create all token regexes once in constructor
    this.indexTokenFilenameRegex = createTokenRegex(this.config.indexToken, {
      type: 'filename',
    })
    this.routeTokenFilenameRegex = createTokenRegex(this.config.routeToken, {
      type: 'filename',
    })
    this.indexTokenSegmentRegex = createTokenRegex(this.config.indexToken, {
      type: 'segment',
    })
    this.routeTokenSegmentRegex = createTokenRegex(this.config.routeToken, {
      type: 'segment',
    })

    for (const plugin of this.plugins) {
      plugin.init?.({ generator: this })
    }
  }

  private getGeneratedRouteTreePath() {
    const generatedRouteTreePath = path.isAbsolute(
      this.config.generatedRouteTree,
    )
      ? this.config.generatedRouteTree
      : path.resolve(this.root, this.config.generatedRouteTree)

    const generatedRouteTreeDir = path.dirname(generatedRouteTreePath)

    if (!existsSync(generatedRouteTreeDir)) {
      mkdirSync(generatedRouteTreeDir, { recursive: true })
    }

    return generatedRouteTreePath
  }

  private getRoutesDirectoryPath() {
    return path.isAbsolute(this.config.routesDirectory)
      ? this.config.routesDirectory
      : path.resolve(this.root, this.config.routesDirectory)
  }

  /**
   * The route files of the route tree by path, with their route ids: the
   * package's own files and the files of the route modules it mounts. Paths
   * use forward slashes on every platform.
   */
  public getRoutesByFileMap(): GetRoutesByFileMapResult {
    const moduleId =
      this.routeModuleContext?.declaration.mode === 'module'
        ? this.routeModuleContext.declaration.moduleId
        : undefined
    const map: GetRoutesByFileMapResult = new Map(
      [...this.routeNodeCache.entries()].map(([filePath, cacheEntry]) => [
        filePath,
        {
          routeId:
            moduleId === undefined
              ? cacheEntry.routeId
              : cacheEntry.routeId === `/${rootPathId}`
                ? `${moduleId}:`
                : `${moduleId}:${cacheEntry.routeId}`,
        },
      ]),
    )
    for (const mount of this.routeModuleContext?.mounts ?? []) {
      for (const { file, routeId } of mount.routeFiles) {
        map.set(replaceBackslash(file), { routeId })
      }
    }
    return map
  }

  /**
   * The routes of the route modules mounted by this package, with their files
   * and parent ids in this package's route tree (for integrations that index
   * routes by id, such as Start's asset manifest).
   */
  public getMountedRouteModuleRoutes(): Array<{
    id: string
    parent: string
    filePath: string | undefined
    fullPath: string
    prerender?: boolean
  }> {
    const context = this.routeModuleContext
    const crawlingResult = this.crawlingResult
    if (!context || !crawlingResult) {
      return []
    }
    const ownModuleId =
      context.declaration.mode === 'module'
        ? context.declaration.moduleId
        : undefined
    const hostId = (node: RouteNode | undefined) =>
      ownModuleId === undefined
        ? (node?.routePath ?? rootRouteId)
        : node
          ? `${ownModuleId}:${node.routePath ?? ''}`
          : `${ownModuleId}:`
    const routes: Array<{
      id: string
      parent: string
      filePath: string | undefined
      fullPath: string
      prerender?: boolean
    }> = []
    for (const mount of context.mounts) {
      const mountNode = this.findMountNode(crawlingResult.acc, mount.key)
      const files = new Map(
        mount.routeFiles.map(({ file, routeId }) => [routeId, file]),
      )
      for (const route of mount.manifest.routes) {
        routes.push({
          id: getInstallationRouteId(mount, route.id),
          parent: route.parent
            ? getInstallationRouteId(mount, route.parent)
            : hostId(mountNode.parent),
          filePath: files.get(route.id),
          fullPath:
            `${mountNode.parent ? inferFullPath(mountNode.parent).replace(/\/$/, '') : ''}${mount.at ?? ''}${route.fullPath}` ||
            '/',
          prerender: route.prerender,
        })
      }
    }
    return routes
  }

  /**
   * Files outside the routes directory that change the generated route tree:
   * the package.json and the manifests of mounted and used route modules.
   * Bundler integrations add them to their watchers.
   */
  /** Current provider tree paths used by client-only bundler resolution. */
  public getRouteModuleClientTrees(): Array<{
    filePath: string
    clientFilePath: string
  }> {
    return [
      ...new Map(
        (this.routeModuleContext?.mounts ?? []).flatMap((mount) =>
          mount.clientTrees.map((entry) => [entry.filePath, entry] as const),
        ),
      ).values(),
    ]
  }

  /** Same page predicate for ordinary routes and installed module routes. */
  public getPrerenderableRoutePaths(): Array<string> {
    const own =
      this.crawlingResult?.acc.routeNodes
        .filter(isPrerenderableRoute)
        .map(inferFullPath) ?? []
    const mounted = this.getMountedRouteModuleRoutes()
      .filter((route) => route.prerender)
      .map((route) => route.fullPath)
    return [
      ...new Set(
        [...own, ...mounted].filter((fullPath) => !fullPath.includes('$')),
      ),
    ]
  }

  private getClientRouteTreePath() {
    const parsed = path.parse(this.generatedRouteTreePath)
    return path.join(parsed.dir, `${parsed.name}.client${parsed.ext}`)
  }

  public getRouteModuleWatchFiles(): Array<string> {
    return [...this.routeModuleFiles]
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
          await this.generatorInternal()
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

    // The route-module context depends on package.json and on the manifests
    // of other packages: a change there regenerates the outputs even when no
    // route file changed.
    const previousRouteModuleHash = this.routeModuleContext?.hash
    const packageRoot = findPackageRoot(this.root)
    const candidateWatchFiles = new Set(
      packageRoot ? [path.join(packageRoot, 'package.json')] : [],
    )
    this.routeModuleFiles = [...candidateWatchFiles]
    this.routeModuleContext = resolveRouteModuleContext({
      root: this.root,
      routeModules: this.config.routeModules,
      onWatchFile: (file) => {
        candidateWatchFiles.add(file)
        this.routeModuleFiles = [...candidateWatchFiles]
      },
      start: {
        package: `@tanstack/${this.config.target}-start`,
        generatedDirectory: path.dirname(this.generatedRouteTreePath),
      },
    })
    if (this.routeModuleContext) {
      if (this.config.disableTypes) {
        throw new Error(
          `[route modules] ${this.routeModuleContext.declaration.packageName}: route modules require TypeScript; "disableTypes" is not supported.`,
        )
      }
      this.routeModuleFiles = [
        ...new Set([
          ...candidateWatchFiles,
          path.join(
            this.routeModuleContext.declaration.packageRoot,
            'package.json',
          ),
          ...this.routeModuleContext.dependencyFiles,
          ...this.routeModuleContext.watchFiles,
        ]),
      ]
    } else {
      const packageRoot = findPackageRoot(this.root)
      this.routeModuleFiles = packageRoot
        ? [path.join(packageRoot, 'package.json')]
        : []
    }
    if (this.routeModuleContext?.hash !== previousRouteModuleHash) {
      writeRouteTreeFile = true
    }

    let getRouteNodesResult: GetRouteNodesResult

    if (this.config.virtualRouteConfig) {
      getRouteNodesResult = await virtualGetRouteNodes(this.config, this.root, {
        indexTokenSegmentRegex: this.indexTokenSegmentRegex,
        routeTokenSegmentRegex: this.routeTokenSegmentRegex,
      })
    } else {
      getRouteNodesResult = await physicalGetRouteNodes(
        this.config,
        this.root,
        {
          indexTokenSegmentRegex: this.indexTokenSegmentRegex,
          routeTokenSegmentRegex: this.routeTokenSegmentRegex,
        },
      )
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

    await this.handleRootNode(rootRouteNode)

    const preRouteNodes = multiSortBy(beforeRouteNodes, [
      (d) => (d.routePath === '/' ? -1 : 1),
      (d) =>
        d.routePath === undefined
          ? undefined
          : countSlashSeparatedParts(d.routePath),
      (d) => (d.filePath.match(this.indexTokenFilenameRegex) ? 1 : -1),
      (d) => (d.filePath.match(Generator.componentPieceRegex) ? 1 : -1),
      (d) => (d.filePath.match(this.routeTokenFilenameRegex) ? -1 : 1),
      (d) => (d.routePath?.endsWith('/') ? -1 : 1),
      (d) => d.routePath,
    ]).filter((d) => {
      // Exclude the root route itself, but keep component/loader pieces for the root
      if (d.routePath === `/${rootPathId}`) {
        return [
          'component',
          'errorComponent',
          'notFoundComponent',
          'pendingComponent',
          'loader',
          'lazy',
        ].includes(d._fsRouteType)
      }
      return true
    })

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
        if (result.value.shouldWriteTree) {
          writeRouteTreeFile = true
        }
        return result.value.node
      }
      return []
    })

    // reset children in case we re-use a node from the cache
    routeFileResult.forEach((r) => (r.children = undefined))

    const acc: HandleNodeAccumulator = {
      routeTree: [],
      routeNodes: [],
      routePiecesByPath: {},
      routeNodesByPath: new Map(),
    }

    const prefixMap = new RoutePrefixMap(routeFileResult)

    for (const node of routeFileResult) {
      Generator.handleNode(node, acc, prefixMap, this.config)
    }

    this.addRouteModuleMounts(acc)

    this.crawlingResult = { rootRouteNode, routeFileResult, acc }

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
      if (this.routeNodeCache.size !== this.routeNodeShadowCache.size) {
        writeRouteTreeFile = true
      } else {
        for (const fullPath of this.routeNodeCache.keys()) {
          if (!this.routeNodeShadowCache.has(fullPath)) {
            writeRouteTreeFile = true
            break
          }
        }
      }
    }

    if (!writeRouteTreeFile) {
      this.swapCaches()
      return
    }

    const buildResult = this.buildRouteTree({
      rootRouteNode,
      acc,
      routeFileResult,
    })
    let routeTreeContent = buildResult.routeTreeContent

    routeTreeContent = this.config.enableRouteTreeFormatting
      ? await format(routeTreeContent, this.config)
      : routeTreeContent

    let newMtimeMs: bigint | undefined
    if (this.routeTreeFileCache) {
      if (this.routeTreeFileCache.fileContent === routeTreeContent) {
        // existing route tree file is already up-to-date, don't write it.
        // When 'force' was set because an external change was detected,
        // we still re-read and re-check here, but if the generated content
        // matches we skip the write to avoid triggering another watcher cycle.
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

    await this.writeRouteModuleFiles(rootRouteNode, acc)

    this.plugins.map((plugin) => {
      return plugin.onRouteTreeChanged?.({
        routeTree: buildResult.routeTree,
        routeNodes: buildResult.routeNodes,
        acc,
        rootRouteNode,
      })
    })
    this.swapCaches()
  }

  /**
   * Writes the generated files of route modules (scope, contract, runtime
   * entry) and applications that mount them (scope), and the module manifest.
   */
  private async writeRouteModuleFiles(
    rootRouteNode: RouteNode,
    acc: HandleNodeAccumulator,
  ) {
    const context = this.routeModuleContext
    if (!context) {
      return
    }
    const header = this.getGeneratedFileHeader(this.config)
    const importFrom = (from: string, baseName: string) =>
      this.getRouteModuleImport(this.getRouteModuleFilePath(from), baseName)
    const routeTreeImport = replaceBackslash(
      removeExt(
        `./${path.basename(this.generatedRouteTreePath)}`,
        this.config.addExtensions,
      ),
    )

    // Generated files live next to the Start file.
    const startImport = replaceBackslash(
      removeExt(
        `./${path.basename(context.start?.file ?? 'start.ts')}`,
        this.config.addExtensions,
      ),
    )

    const files: Array<[string, string]> = [
      [
        ROUTE_SCOPE_FILE,
        buildRouteScopeSource({
          context,
          frameworkPackage: this.targetTemplate.fullPkg,
          routeTreeImport,
          startImport,
          header,
          ownRouteIds:
            context.declaration.mode === 'module'
              ? [
                  `${context.declaration.moduleId}:`,
                  ...acc.routeNodes.map(
                    (node) =>
                      `${context.declaration.moduleId}:${node.routePath ?? ''}`,
                  ),
                  ...context.mounts.flatMap((mount) =>
                    mount.manifest.routes.map((route) =>
                      getInstallationRouteId(mount, route.id),
                    ),
                  ),
                ]
              : [],
          namespaceImport: (module) =>
            importFrom(
              ROUTE_SCOPE_FILE,
              getRouteNamespaceFile(module, context),
            ),
        }),
      ],
      ...context.scope.map((module): [string, string] => [
        getRouteNamespaceFile(module, context),
        buildRouteNamespaceSource({
          context,
          module,
          frameworkPackage: this.targetTemplate.fullPkg,
          routeTreeImport,
          header,
        }),
      ]),
    ]
    if (context.declaration.mode === 'module') {
      files.push(
        [
          ROUTE_CONTRACT_FILE,
          buildRouteContractSource({
            context,
            frameworkPackage: this.targetTemplate.fullPkg,
            routeTreeImport,
            routeScopeImport: importFrom(ROUTE_CONTRACT_FILE, ROUTE_SCOPE_FILE),
            header,
          }),
        ],
        [
          ROUTE_MODULE_FILE,
          buildRouteModuleSource({
            context,
            routeTreeImport,
            startImport,
            header,
          }),
        ],
      )
    } else {
      const startModulesFile = this.getRouteModuleFilePath(START_MODULES_FILE)
      if (context.start && context.mounts.length > 0) {
        files.push([
          START_MODULES_FILE,
          buildStartModulesSource({ context, startImport, header }),
        ])
      } else if (existsSync(startModulesFile)) {
        await fsp.rm(startModulesFile, { force: true })
      }
    }

    if (context.declaration.mode === 'module') {
      const pruned = pruneServerOnlySubtrees({ rootRouteNode, acc })
      const client = this.buildRouteTree({
        rootRouteNode,
        routeFileResult: this.crawlingResult!.routeFileResult,
        acc: { ...acc, ...pruned },
        config: {
          ...this.config,
          disableTypes: true,
          // This runtime view omits the full tree's declarations and assertions.
          // Keep it in ordinary TypeScript builds so they emit its JavaScript.
          routeTreeFileHeader: [
            ...this.config.routeTreeFileHeader.filter(
              (line) => line !== '// @ts-nocheck',
            ),
            '// @ts-nocheck',
          ],
        },
      })
      const filePath = this.getClientRouteTreePath()
      // This runtime-only view has no public route contract. Give its incidental
      // declaration a portable name instead of inferring dependency internals.
      const source = /\.(?:[cm]?ts|tsx)$/.test(filePath)
        ? client.routeTreeContent.replace(
            /^export const routeTree = /m,
            `export const routeTree: import('${this.targetTemplate.fullPkg}').AnyRoute = `,
          )
        : client.routeTreeContent
      const content = this.config.enableRouteTreeFormatting
        ? await format(source, this.config)
        : source
      const existing = await this.fs.readFile(filePath)
      if (
        existing === 'file-not-existing' ||
        existing.fileContent !== content
      ) {
        await this.safeFileWrite({
          filePath,
          newContent: content,
          strategy:
            existing === 'file-not-existing'
              ? { type: 'new-file' }
              : { type: 'mtime', expectedMtimeMs: existing.stat.mtimeMs },
        })
      }
    }
    const namespaceNames = new Set(
      context.scope.map((module) =>
        path.basename(
          this.getRouteModuleFilePath(getRouteNamespaceFile(module, context)),
        ),
      ),
    )
    for (const entry of await fsp.readdir(
      path.dirname(this.generatedRouteTreePath),
    )) {
      if (
        /^routeScope\.gen\.namespace\d+\.ts$/.test(entry) &&
        !namespaceNames.has(entry)
      ) {
        await fsp.rm(
          path.join(path.dirname(this.generatedRouteTreePath), entry),
        )
      }
    }

    for (const [baseName, source] of files) {
      const content = this.config.enableRouteTreeFormatting
        ? await format(source, this.config)
        : source
      const filePath = this.getRouteModuleFilePath(baseName)
      const existing = await this.fs.readFile(filePath)
      if (
        existing === 'file-not-existing' ||
        existing.fileContent !== content
      ) {
        await this.fs.writeFile(filePath, content)
      }
    }

    if (context.declaration.mode === 'module') {
      await writeManifest(
        context.declaration.packageRoot,
        this.buildRouteModuleManifest(context, rootRouteNode, acc),
      )
    }
  }

  private buildRouteModuleManifest(
    context: RouteModuleContext,
    rootRouteNode: RouteNode,
    acc: HandleNodeAccumulator,
  ): RouteModuleManifest {
    const { declaration } = context
    const moduleId = declaration.moduleId!
    const joinPath = (prefix: string, local: string) =>
      prefix === '' ? local : local === '/' ? `${prefix}/` : `${prefix}${local}`
    const routeId = (node: RouteNode | undefined) =>
      node ? `${moduleId}:${node.routePath ?? ''}` : `${moduleId}:`
    const routes: Array<ManifestRoute> = [
      { id: `${moduleId}:`, parent: null, fullPath: '/', leaf: false },
      ...acc.routeNodes.map((node) => ({
        id: routeId(node),
        parent: routeId(node.parent),
        fullPath: inferFullPath(node),
        leaf: !node.children?.length,
        ...(isPrerenderableRoute(node) ? { prerender: true } : {}),
      })),
    ]
    const routeFiles = [rootRouteNode, ...acc.routeNodes]
      .filter((node) => node.fullPath && !node.isVirtual)
      .map((node) => ({
        owner: [] as Array<string>,
        file: replaceBackslash(
          path.relative(declaration.packageRoot, realpathSync(node.fullPath)),
        ),
        routeId:
          node === rootRouteNode
            ? `${moduleId}:`
            : `${moduleId}:${node.routePath ?? ''}`,
      }))
    const modules: Array<ManifestInstalledModule> = [
      {
        id: moduleId,
        key: moduleId,
        uses: context.scope
          .filter(
            (module) =>
              module.source.installedBy === null &&
              !context.mounts.some(
                (mount) => mount.moduleId === module.moduleId,
              ),
          )
          .map((module) => module.moduleId),
        mountPath: '/',
        includedBy: null,
      },
    ]

    for (const mount of context.mounts) {
      const mountNode = this.findMountNode(acc, mount.key)
      const parentPath = mountNode.parent
        ? inferFullPath(mountNode.parent).replace(/\/$/, '')
        : ''
      const prefix = `${parentPath}${mount.at ?? ''}`
      routes.push(
        ...mount.manifest.routes.map((route) => ({
          ...route,
          id: getInstallationRouteId(mount, route.id),
          parent: route.parent
            ? getInstallationRouteId(mount, route.parent)
            : routeId(mountNode.parent),
          fullPath: joinPath(prefix, route.fullPath),
        })),
      )
      routeFiles.push(
        ...mount.manifest.routeFiles.map((entry) => ({
          ...entry,
          owner: [mount.moduleId, ...entry.owner],
          routeId: getInstallationRouteId(mount, entry.routeId),
        })),
      )
      modules.push(
        ...mount.manifest.modules.map((installed) => ({
          ...installed,
          key: installed.key === mount.moduleId ? mount.key : installed.key,
          mountPath: joinPath(prefix, installed.mountPath),
          includedBy: installed.includedBy ?? declaration.packageName,
        })),
      )
    }

    const topology: Omit<RouteModuleManifest, 'topologyToken'> = {
      version: ROUTE_MODULE_MANIFEST_VERSION,
      id: moduleId,
      packageName: declaration.packageName,
      routes,
      routeFiles,
      clientTrees: [
        {
          owner: [],
          file: replaceBackslash(
            path.relative(declaration.packageRoot, this.generatedRouteTreePath),
          ),
          clientFile: replaceBackslash(
            path.relative(
              declaration.packageRoot,
              this.getClientRouteTreePath(),
            ),
          ),
        },
        ...context.mounts.flatMap((mount) =>
          mount.manifest.clientTrees.map((entry) => ({
            ...entry,
            owner: [mount.moduleId, ...entry.owner],
          })),
        ),
      ],
      modules,
      startModules: context.exportsStartModules,
    }
    return { ...topology, topologyToken: computeTopologyToken(topology) }
  }

  private swapCaches() {
    this.routeNodeCache = this.routeNodeShadowCache
    this.routeNodeShadowCache = new Map()
  }

  public buildRouteTree(opts: {
    rootRouteNode: RouteNode
    acc: HandleNodeAccumulator
    routeFileResult: Array<RouteNode>
    config?: Partial<Config>
  }) {
    const config = { ...this.config, ...(opts.config || {}) }

    const { rootRouteNode } = opts
    // Mounted module roots only appear as children; integrations that rebuild
    // the node list from the tree (e.g. Start's server-only pruning) may
    // collect them, so they never count as route nodes of this package.
    const acc: HandleNodeAccumulator = {
      ...opts.acc,
      routeNodes: opts.acc.routeNodes.filter((node) => !node._routeModuleMount),
    }

    // Reserve names from the complete crawl even when Start rebuilds a pruned
    // client tree. Repeated builds must not rename the surviving routes.
    const namingNodes = this.crawlingResult?.acc.routeNodes ?? acc.routeNodes
    const context = this.routeModuleContext
    const moduleIds = new Set([
      ...(context?.visibleContracts ?? []),
      ...(context?.mounts.flatMap((mount) => [mount.moduleId, mount.key]) ??
        []),
      ...(context?.scope.flatMap((module) => [
        module.key,
        module.source.contractPackage,
        ...(module.hostedThrough ? [module.hostedThrough] : []),
      ]) ?? []),
    ])
    const nodeKey = (node: RouteNode) =>
      `route:${node.routePath ?? ''}:${node.filePath}:${node._fsRouteType}`
    const names = allocateGeneratedNames(
      [
        ...namingNodes.map((node) => {
          let preferred = this.originalRouteNames.get(node)
          if (preferred === undefined) {
            preferred = node.variableName
            this.originalRouteNames.set(node, preferred)
          }
          return {
            key: nodeKey(node),
            preferred,
            suffixes: routeBindingSuffixes,
          }
        }),
        ...[...moduleIds].map((id) => ({
          key: `module:${id}`,
          preferred: getModuleIdentifier(id),
          suffixes: moduleBindingSuffixes,
        })),
      ],
      [
        ...generatedPublicNames,
        ...(context?.scope.map((module) => module.namespace) ?? []),
      ],
    )
    for (const node of namingNodes) {
      node.variableName = names.get(nodeKey(node))!
    }
    if (context) {
      context.identifiers = new Map(
        [...moduleIds].map((id) => [id, names.get(`module:${id}`)!]),
      )
      for (const mount of context.mounts) {
        this.findMountNode(acc, mount.key).variableName = getMountVariableName(
          mount.key,
          context.identifiers,
        )
      }
    }

    // Use pre-compiled regex if config hasn't been overridden, otherwise create new one
    const indexTokenSegmentRegex =
      config.indexToken === this.config.indexToken
        ? this.indexTokenSegmentRegex
        : createTokenRegex(config.indexToken, { type: 'segment' })

    const sortedRouteNodes = sortRouteNodes(
      acc.routeNodes,
      indexTokenSegmentRegex,
    )

    const routeModule = this.routeModuleContext
    const moduleId =
      routeModule?.declaration.mode === 'module'
        ? routeModule.declaration.moduleId!
        : undefined
    // Route modules qualify their route ids with the module id.
    const qualifyId = (id: string) =>
      moduleId === undefined ? id : `${moduleId}:${id}`
    const rootId = moduleId === undefined ? rootRouteId : `${moduleId}:`

    const routeImports: Array<ImportDeclaration> = []
    const virtualRouteNodes: Array<string> = []

    for (const node of sortedRouteNodes) {
      if (node.isVirtual) {
        virtualRouteNodes.push(
          `const ${node.variableName}RouteImport = createFileRoute('${qualifyId(node.routePath ?? '')}')()`,
        )
      } else {
        routeImports.push(
          getImportForRouteNode(
            node,
            config,
            this.generatedRouteTreePath,
            this.root,
          ),
        )
      }
    }

    const imports: Array<ImportDeclaration> = []
    if (virtualRouteNodes.length > 0) {
      imports.push({
        specifiers: [{ imported: 'createFileRoute' }],
        source:
          moduleId === undefined
            ? this.targetTemplate.fullPkg
            : this.getRouteModuleImport(
                this.generatedRouteTreePath,
                ROUTE_SCOPE_FILE,
              ),
      })
    }
    // Mounted modules are validated before their mounts are emitted: the
    // installations used modules link into assume valid host params.
    this.checkRouteModuleFullPaths(acc)
    this.checkRouteModuleHostParams(acc)
    const mountStatements: Array<string> = []
    const mountHostParams: Array<string> = []
    if (routeModule && routeModule.mounts.length > 0) {
      imports.push({
        specifiers: [{ imported: 'mountRouteModule' }],
        source: `${this.targetTemplate.fullPkg}/_internal/route-module`,
      })
      const moduleUses = this.getRouteModuleUses(acc)
      const importedModules = new Set<string>()
      for (const mount of routeModule.mounts) {
        const importName = `${getModuleIdentifier(mount.moduleId, routeModule.identifiers)}RouteModule`
        if (!importedModules.has(mount.moduleId)) {
          importedModules.add(mount.moduleId)
          imports.push({
            specifiers: [{ imported: 'routeModule', local: importName }],
            source: `${mount.moduleId}/route-module`,
          })
        }
        const mountNode = this.findMountNode(acc, mount.key)
        const parentVariable = mountNode.parent
          ? `${mountNode.parent.variableName}Route`
          : 'rootRouteImport'
        const uses = moduleUses.get(mount.key)
        mountStatements.push(
          `const ${getMountVariableName(mount.key, routeModule.identifiers)}Route${config.disableTypes ? '' : `: typeof ${importName}`} = mountRouteModule(${importName}, {
  parent: () => ${parentVariable},${mount.at === undefined ? '' : `\n  at: '${mount.at}',`}${mount.as === undefined ? '' : `\n  as: '${mount.as}',`}${
    uses
      ? `\n  uses: { ${Object.entries(uses)
          .map(([used, installation]) => `'${used}': '${installation}'`)
          .join(', ')} },`
      : ''
  }
})`,
        )
        mountHostParams.push(
          `  '${mount.key}': (typeof ${parentVariable})['types']['allParams']`,
        )
      }
      if (!config.disableTypes) {
        mountStatements.push(
          `/** The path params of the routes above each mounted route module. */
export interface MountedModuleHostParams {
${mountHostParams.join('\n')}
}`,
        )
      }
    }
    if (routeModule && !config.disableTypes) {
      if (routeModule.visibleContracts.length > 0) {
        imports.push({
          specifiers: [{ imported: 'MountedRoutesById' }],
          source: this.targetTemplate.fullPkg,
          importKind: 'type',
        })
      }
      if (routeModule.mounts.some((mount) => mount.as !== undefined)) {
        imports.push({
          specifiers: [{ imported: 'InstallationRoutesById' }],
          source: this.targetTemplate.fullPkg,
          importKind: 'type',
        })
      }
      for (const contractPackage of routeModule.visibleContracts) {
        imports.push({
          specifiers: [
            {
              imported: 'InstalledRoutesById',
              local: `${getModuleIdentifier(contractPackage, routeModule.identifiers)}InstalledRoutesById`,
            },
          ],
          source: `${contractPackage}/route-types`,
          importKind: 'type',
        })
      }
    }
    // Add lazyRouteComponent import if there are component pieces
    let hasComponentPieces = false
    let hasLoaderPieces = false
    for (const node of sortedRouteNodes) {
      const pieces = acc.routePiecesByPath[node.routePath!]
      if (pieces) {
        if (
          pieces.component ||
          pieces.errorComponent ||
          pieces.notFoundComponent ||
          pieces.pendingComponent
        ) {
          hasComponentPieces = true
        }
        if (pieces.loader) {
          hasLoaderPieces = true
        }
        if (hasComponentPieces && hasLoaderPieces) break
      }
    }
    if (hasComponentPieces || hasLoaderPieces) {
      const runtimeImport: ImportDeclaration = {
        specifiers: [],
        source: this.targetTemplate.fullPkg,
      }
      if (hasComponentPieces) {
        runtimeImport.specifiers.push({ imported: 'lazyRouteComponent' })
      }
      if (hasLoaderPieces) {
        runtimeImport.specifiers.push({ imported: 'lazyFn' })
      }
      imports.push(runtimeImport)
    }
    const routeTreeConfig = buildRouteTreeConfig(
      acc.routeTree,
      config.disableTypes,
    )

    const createUpdateRoutes = sortedRouteNodes.map((node) => {
      const pieces = acc.routePiecesByPath[node.routePath!]
      const loaderNode = pieces?.loader
      const componentNode = pieces?.component
      const errorComponentNode = pieces?.errorComponent
      const notFoundComponentNode = pieces?.notFoundComponent
      const pendingComponentNode = pieces?.pendingComponent
      const lazyComponentNode = pieces?.lazy

      return [
        [
          `const ${node.variableName}Route = ${node.variableName}RouteImport.update({
            ${[
              `id: '${node.path}'`,
              !node.isNonPath ||
              (node._fsRouteType === 'pathless_layout' && node.cleanedPath)
                ? `path: '${node.cleanedPath}'`
                : undefined,
              `getParentRoute: () => ${findParent(node)}`,
            ]
              .filter(Boolean)
              .join(',')}
          }${config.disableTypes ? '' : 'as any'})`,
          loaderNode
            ? `.updateLoader({ loader: lazyFn(() => import('./${replaceBackslash(
                removeExt(
                  path.relative(
                    path.dirname(config.generatedRouteTree),
                    path.resolve(config.routesDirectory, loaderNode.filePath),
                  ),
                  config.addExtensions,
                ),
              )}'), 'loader') })`
            : '',
          componentNode ||
          errorComponentNode ||
          notFoundComponentNode ||
          pendingComponentNode
            ? `.update({
                ${(
                  [
                    ['component', componentNode],
                    ['errorComponent', errorComponentNode],
                    ['notFoundComponent', notFoundComponentNode],
                    ['pendingComponent', pendingComponentNode],
                  ] as const
                )
                  .filter((d) => d[1])
                  .map((d) => {
                    // For .vue files, use 'default' as the export name since Vue SFCs export default
                    const isVueFile = d[1]!.filePath.endsWith('.vue')
                    const exportName = isVueFile ? 'default' : d[0]
                    // Keep .vue extension for Vue files since Vite requires it
                    const importPath = replaceBackslash(
                      isVueFile
                        ? path.relative(
                            path.dirname(config.generatedRouteTree),
                            path.resolve(
                              config.routesDirectory,
                              d[1]!.filePath,
                            ),
                          )
                        : removeExt(
                            path.relative(
                              path.dirname(config.generatedRouteTree),
                              path.resolve(
                                config.routesDirectory,
                                d[1]!.filePath,
                              ),
                            ),
                            config.addExtensions,
                          ),
                    )
                    return `${
                      d[0]
                    }: lazyRouteComponent(() => import('./${importPath}'), '${exportName}')`
                  })
                  .join('\n,')}
              })`
            : '',
          lazyComponentNode
            ? (() => {
                // For .vue files, use 'default' export since Vue SFCs export default
                const isVueFile = lazyComponentNode.filePath.endsWith('.vue')
                const exportAccessor = isVueFile ? 'd.default' : 'd.Route'
                // Keep .vue extension for Vue files since Vite requires it
                const importPath = replaceBackslash(
                  isVueFile
                    ? path.relative(
                        path.dirname(config.generatedRouteTree),
                        path.resolve(
                          config.routesDirectory,
                          lazyComponentNode.filePath,
                        ),
                      )
                    : removeExt(
                        path.relative(
                          path.dirname(config.generatedRouteTree),
                          path.resolve(
                            config.routesDirectory,
                            lazyComponentNode.filePath,
                          ),
                        ),
                        config.addExtensions,
                      ),
                )
                return `.lazy(() => import('./${importPath}').then((d) => ${exportAccessor}))`
              })()
            : '',
        ].join(''),
      ].join('\n\n')
    })

    // Generate update for root route if it has component pieces
    const rootRoutePath = `/${rootPathId}`
    const rootPieces = acc.routePiecesByPath[rootRoutePath]
    const rootComponentNode = rootPieces?.component
    const rootErrorComponentNode = rootPieces?.errorComponent
    const rootNotFoundComponentNode = rootPieces?.notFoundComponent
    const rootPendingComponentNode = rootPieces?.pendingComponent

    let rootRouteUpdate = ''
    if (
      rootComponentNode ||
      rootErrorComponentNode ||
      rootNotFoundComponentNode ||
      rootPendingComponentNode
    ) {
      rootRouteUpdate = `const rootRouteWithChildren = rootRouteImport${
        rootComponentNode ||
        rootErrorComponentNode ||
        rootNotFoundComponentNode ||
        rootPendingComponentNode
          ? `.update({
              ${(
                [
                  ['component', rootComponentNode],
                  ['errorComponent', rootErrorComponentNode],
                  ['notFoundComponent', rootNotFoundComponentNode],
                  ['pendingComponent', rootPendingComponentNode],
                ] as const
              )
                .filter((d) => d[1])
                .map((d) => {
                  // For .vue files, use 'default' as the export name since Vue SFCs export default
                  const isVueFile = d[1]!.filePath.endsWith('.vue')
                  const exportName = isVueFile ? 'default' : d[0]
                  // Keep .vue extension for Vue files since Vite requires it
                  const importPath = replaceBackslash(
                    isVueFile
                      ? path.relative(
                          path.dirname(config.generatedRouteTree),
                          path.resolve(config.routesDirectory, d[1]!.filePath),
                        )
                      : removeExt(
                          path.relative(
                            path.dirname(config.generatedRouteTree),
                            path.resolve(
                              config.routesDirectory,
                              d[1]!.filePath,
                            ),
                          ),
                          config.addExtensions,
                        ),
                  )
                  return `${d[0]}: lazyRouteComponent(() => import('./${importPath}'), '${exportName}')`
                })
                .join('\n,')}
            })`
          : ''
      }._addFileChildren(rootRouteChildren)${config.disableTypes ? '' : `._addFileTypes<FileRouteTypes>()`}`
    }

    let fileRoutesByPathInterface = ''
    let fileRoutesByFullPath = ''

    if (!config.disableTypes) {
      const routeNodesByFullPath = createRouteNodesByFullPath(acc.routeNodes)
      const routeNodesByTo = createRouteNodesByTo(acc.routeNodes)
      const routeNodesById = createRouteNodesById(acc.routeNodes)

      fileRoutesByFullPath = [
        `export interface FileRoutesByFullPath {
${[...routeNodesByFullPath.entries()]
  .filter(([fullPath]) => fullPath)
  .map(([fullPath, routeNode]) => {
    return `'${fullPath}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
  })}
}`,
        `export interface FileRoutesByTo {
${[...routeNodesByTo.entries()]
  .filter(([to]) => to)
  .map(([to, routeNode]) => {
    return `'${to}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
  })}
}`,
        `export interface FileRoutesById {
'${rootId}': typeof rootRouteImport,
${[...routeNodesById.entries()].map(([id, routeNode]) => {
  return `'${qualifyId(id)}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
})}
}`,
        // Route modules see the routes of the modules in their scope by id;
        // the interface references their declarations instead of copying them.
        ...(routeModule
          ? [
              `interface RouteModuleRoutesById extends FileRoutesById${routeModule.visibleContracts
                .flatMap((contractPackage) => {
                  const installedRoutes = `${getModuleIdentifier(contractPackage, routeModule.identifiers)}InstalledRoutesById`
                  // A module installed several times has the routes of each
                  // installation, by `<moduleId>#<as>:/…` ids.
                  return routeModule.mounts.some(
                    (mount) =>
                      mount.moduleId === contractPackage &&
                      mount.as !== undefined,
                  )
                    ? routeModule.mounts
                        .filter((mount) => mount.moduleId === contractPackage)
                        .map(
                          (mount) =>
                            `, MountedRoutesById<InstallationRoutesById<${installedRoutes}, '${mount.moduleId}', '${mount.as}'>>`,
                        )
                    : [`, MountedRoutesById<${installedRoutes}>`]
                })
                .join('')} {}`,
            ]
          : []),
        `export interface FileRouteTypes {
fileRoutesByFullPath: FileRoutesByFullPath
fullPaths: ${
          acc.routeNodes.length > 0
            ? [...routeNodesByFullPath.keys()]
                .filter((fullPath) => fullPath)
                .map((fullPath) => `'${fullPath}'`)
                .join('|')
            : 'never'
        }
fileRoutesByTo: FileRoutesByTo
to: ${
          acc.routeNodes.length > 0
            ? [...routeNodesByTo.keys()]
                .filter((to) => to)
                .map((to) => `'${to}'`)
                .join('|')
            : 'never'
        }
id: ${
          routeModule
            ? 'keyof RouteModuleRoutesById'
            : [
                `'${rootRouteId}'`,
                ...[...routeNodesById.keys()].map((id) => `'${id}'`),
              ].join('|')
        }
fileRoutesById: ${routeModule ? 'RouteModuleRoutesById' : 'FileRoutesById'}
}`,
        `export interface RootRouteChildren {
${acc.routeTree.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`,
      ].join('\n')

      fileRoutesByPathInterface = buildFileRoutesByPathInterface({
        // Route modules keep their file routes local: no global augmentation.
        module:
          moduleId === undefined ? this.targetTemplate.fullPkg : undefined,
        interfaceName: 'FileRoutesByPath',
        routeNodes: sortedRouteNodes,
        config,
        qualifyId,
      })
    }

    const routeTree = [
      `const rootRouteChildren${config.disableTypes ? '' : `: RootRouteChildren`} = {
  ${acc.routeTree
    .map(
      (child) =>
        `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`,
    )
    .join(',')}
}`,
      rootRouteUpdate
        ? rootRouteUpdate.replace(
            'const rootRouteWithChildren = ',
            'export const routeTree = ',
          )
        : `export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)${config.disableTypes ? '' : `._addFileTypes<FileRouteTypes>()`}`,
    ].join('\n')

    checkRouteFullPathUniqueness(
      sortedRouteNodes.filter(
        (d) => d.children === undefined && 'lazy' !== d._fsRouteType,
      ),
      config,
    )

    let mergedImports = mergeImportDeclarations(imports)
    if (config.disableTypes) {
      mergedImports = mergedImports.filter((d) => d.importKind !== 'type')
    }

    const importStatements = mergedImports.map(buildImportString)

    const rootRouteImport = getImportForRouteNode(
      rootRouteNode,
      config,
      this.generatedRouteTreePath,
      this.root,
    )
    routeImports.unshift(rootRouteImport)

    let footer: Array<string> = []
    if (config.routeTreeFileFooter) {
      if (Array.isArray(config.routeTreeFileFooter)) {
        footer = config.routeTreeFileFooter
      } else {
        footer = config.routeTreeFileFooter()
      }
    }
    const routeTreeContent = [
      ...this.getGeneratedFileHeader(config),
      ...(routeModule?.declaration.mode === 'host' &&
      routeModule.start &&
      routeModule.mounts.length > 0 &&
      !config.disableTypes
        ? [
            `export type { StartModulesCheck } from '${this.getRouteModuleImport(this.generatedRouteTreePath, START_MODULES_FILE)}'`,
          ]
        : []),
      `// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.`,
      [...importStatements].join('\n'),
      mergeImportDeclarations(routeImports).map(buildImportString).join('\n'),
      virtualRouteNodes.join('\n'),
      createUpdateRoutes.join('\n'),
      mountStatements.join('\n\n'),
      fileRoutesByFullPath,
      fileRoutesByPathInterface,
      routeTreeConfig.join('\n'),
      routeTree,
      ...footer,
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      routeTreeContent,
      routeTree: acc.routeTree,
      routeNodes: acc.routeNodes,
    }
  }

  private async processRouteNodeFile(node: RouteNode): Promise<{
    shouldWriteTree: boolean
    cacheEntry: RouteNodeCacheEntry
    node: RouteNode
  } | null> {
    const result = await this.isRouteFileCacheFresh(node)

    if (result.status === 'fresh') {
      return {
        node: result.cacheEntry.node,
        shouldWriteTree: false,
        cacheEntry: result.cacheEntry,
      }
    }

    const previousCacheEntry = result.cacheEntry

    const existingRouteFile = await this.fs.readFile(node.fullPath)
    if (existingRouteFile === 'file-not-existing') {
      throw new Error(`⚠️ File ${node.fullPath} does not exist`)
    }

    if (node.routePath) {
      validateRouteParams(node.routePath, node.filePath, this.logger)
    }

    const updatedCacheEntry: RouteNodeCacheEntry = {
      fileContent: existingRouteFile.fileContent,
      mtimeMs: existingRouteFile.stat.mtimeMs,
      routeId: node.routePath ?? '$$TSR_NO_ROUTE_PATH_ASSIGNED$$',
      node,
    }

    const routeModule = this.getRouteFileModuleScope(node)
    if (routeModule && node._fsRouteType === 'lazy') {
      throw new Error(
        `[route modules] ${node.fullPath}: lazy route files (".lazy" files and createLazyFileRoute) are not supported in route modules. Use automatic code splitting instead.`,
      )
    }
    const escapedRoutePath = routeModule
      ? routeModule.routeId
      : (node.routePath?.replaceAll('$', '$$') ?? '')

    let shouldWriteRouteFile = false
    let shouldWriteTree = false
    // now we need to either scaffold the file or transform it
    if (!existingRouteFile.fileContent) {
      shouldWriteRouteFile = true
      shouldWriteTree = true
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
            'notFoundComponent',
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
            tsrImports: routeModule
              ? `import { createFileRoute } from '${routeModule.importSource}';`
              : tRouteTemplate.imports.tsrImports(),
            tsrPath: escapedRoutePath.replaceAll(/\{(.+?)\}/gm, '$1'),
            tsrExportStart:
              tRouteTemplate.imports.tsrExportStart(escapedRoutePath),
            tsrExportEnd: tRouteTemplate.imports.tsrExportEnd(),
          },
        )
      } else {
        return null
      }
    }

    // Check if this is a Vue component file
    // Vue SFC files (.vue) don't need transformation as they can't have a Route export
    const isVueFile = node.filePath.endsWith('.vue')

    if (!isVueFile) {
      // transform the file
      const transformResult = await transform({
        source: updatedCacheEntry.fileContent,
        filename: node.fullPath,
        ctx: {
          target: this.config.target,
          routeId: escapedRoutePath,
          lazy: node._fsRouteType === 'lazy',
          routeImportSource: routeModule?.importSource,
        },
        node,
      })

      if (transformResult.result === 'no-route-export') {
        const fileName = path.basename(node.fullPath)
        const dirName = path.dirname(node.fullPath)
        const ignorePrefix = this.config.routeFileIgnorePrefix
        const ignorePattern = this.config.routeFileIgnorePattern
        const suggestedFileName = `${ignorePrefix}${fileName}`
        const suggestedFullPath = path.join(dirName, suggestedFileName)

        let message = `Warning: Route file "${node.fullPath}" does not export a Route. This file will not be included in the route tree.`
        message += `\n\nIf this file is not intended to be a route, you can exclude it using one of these options:`
        message += `\n  1. Rename the file to "${suggestedFullPath}" (prefix with "${ignorePrefix}")`
        message += `\n  2. Use 'routeFileIgnorePattern' in your config to match this file`
        message += `\n\nCurrent configuration:`
        message += `\n  routeFileIgnorePrefix: "${ignorePrefix}"`
        message += `\n  routeFileIgnorePattern: ${ignorePattern ? `"${ignorePattern}"` : 'undefined'}`

        this.logger.warn(message)
        return null
      }
      if (transformResult.result === 'error') {
        throw new Error(
          `Error transforming route file ${node.fullPath}: ${transformResult.error}`,
        )
      }
      if (transformResult.result === 'modified') {
        updatedCacheEntry.fileContent = transformResult.output
        shouldWriteRouteFile = true
      }
    }

    const previousProps = previousCacheEntry?.node.createFileRouteProps
    const props = node.createFileRouteProps
    if (
      previousProps?.size !== props?.size ||
      [...(props ?? [])].some((prop) => !previousProps?.has(prop))
    ) {
      shouldWriteTree = true
    }
    for (const plugin of this.plugins) {
      plugin.afterTransform?.({ node, prevNode: previousCacheEntry?.node })
    }

    // file was changed
    if (shouldWriteRouteFile) {
      const stats = await this.safeFileWrite({
        filePath: node.fullPath,
        newContent: updatedCacheEntry.fileContent,
        strategy: {
          type: 'mtime',
          expectedMtimeMs: updatedCacheEntry.mtimeMs,
          expectedContent: existingRouteFile.fileContent,
        },
      })
      updatedCacheEntry.mtimeMs = stats.mtimeMs
    }

    this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry)
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
          // An in-place save can truncate and rewrite a file within one mtime
          // tick, so user-authored files also compare the content.
          expectedContent?: string
        }
      | {
          type: 'new-file'
        }
  }) {
    const tmpPath = this.getTempFileName(opts.filePath)
    await this.fs.writeFile(tmpPath, opts.newContent)

    if (opts.strategy.type === 'mtime') {
      const { expectedMtimeMs, expectedContent } = opts.strategy
      const beforeStat = await this.fs.stat(opts.filePath)
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
      // Check right before the rename so that changes made while the
      // temporary file was prepared are not overwritten.
      let changed: boolean
      if (expectedContent === undefined) {
        const current = await this.fs.stat(opts.filePath)
        changed = current.mtimeMs !== expectedMtimeMs
      } else {
        const current = await this.fs.readFile(opts.filePath)
        changed =
          current === 'file-not-existing' ||
          current.stat.mtimeMs !== expectedMtimeMs ||
          current.fileContent !== expectedContent
      }
      if (changed) {
        throw rerun({
          msg: `File ${opts.filePath} was modified by another process during processing.`,
          event: { type: 'update', path: opts.filePath },
        })
      }
    } else {
      if (await checkFileExists(opts.filePath)) {
        throw rerun({
          msg: `File ${opts.filePath} already exists. Cannot overwrite.`,
          event: { type: 'update', path: opts.filePath },
        })
      }
    }

    await this.fs.rename(tmpPath, opts.filePath)

    // stat the target file AFTER rename so the cached mtime matches
    // what the filesystem reports for the actual file path.
    // Previously we stat'd the temp file before rename, but rename()
    // can assign a different mtime to the target on some filesystems,
    // causing the cache to be permanently stale.
    const stat = await this.fs.stat(opts.filePath)

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
      if (fileChangedCache.result === true) {
        return {
          status: 'fresh',
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
      this.routeNodeShadowCache.set(node.fullPath, result.cacheEntry)
    }
    const rootNodeFile = await this.fs.readFile(node.fullPath)
    if (rootNodeFile === 'file-not-existing') {
      throw new Error(`⚠️ expected root route to exist at ${node.fullPath}`)
    }

    const updatedCacheEntry: RouteNodeCacheEntry = {
      fileContent: rootNodeFile.fileContent,
      mtimeMs: rootNodeFile.stat.mtimeMs,
      routeId: node.routePath ?? '$$TSR_NO_ROOT_ROUTE_PATH_ASSIGNED$$',
      node,
    }

    // scaffold the root route
    if (!rootNodeFile.fileContent) {
      const rootTemplate = this.targetTemplate.rootRoute
      const routeModule = this.getRouteFileModuleScope(node)
      const rootRouteContent = await fillTemplate(
        this.config,
        rootTemplate.template(),
        routeModule
          ? {
              // A route module's root declares the router context it
              // requires: `createModuleRoot<{ queryClient: QueryClient }>()`.
              tsrImports: `import { Outlet } from '${this.targetTemplate.fullPkg}';\nimport { createModuleRoot } from '${routeModule.importSource}';`,
              tsrPath: routeModule.routeId,
              tsrExportStart: 'export const Route = createModuleRoot()(',
              tsrExportEnd: rootTemplate.imports.tsrExportEnd(),
            }
          : {
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
          expectedContent: rootNodeFile.fileContent,
        },
      })
      updatedCacheEntry.fileContent = rootRouteContent
      updatedCacheEntry.mtimeMs = stats.mtimeMs
    }

    this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry)
  }

  /**
   * Adds the roots of mounted route modules as children of their host routes.
   * They appear only in the children of the route tree; their routes are
   * described by the modules' own declarations.
   */
  private addRouteModuleMounts(acc: HandleNodeAccumulator) {
    const context = this.routeModuleContext
    if (!context) {
      return
    }
    const moduleId = context.declaration.moduleId
    for (const mount of context.mounts) {
      let parentId = mount.include.parent
      if (moduleId && parentId?.startsWith(`${moduleId}:`)) {
        parentId = parentId.slice(moduleId.length + 1)
      }
      const parent =
        parentId === undefined || parentId === rootRouteId
          ? undefined
          : acc.routeNodesByPath.get(parentId)
      if (parentId !== undefined && parentId !== rootRouteId && !parent) {
        throw new Error(
          `[route modules] ${context.declaration.packageName}: the parent route "${mount.include.parent}" of "${mount.moduleId}" does not exist.`,
        )
      }
      const mountNode: RouteNode = {
        filePath: '',
        fullPath: '',
        variableName: getMountVariableName(mount.key),
        _fsRouteType: 'static',
        parent,
        _routeModuleMount: {
          moduleId: mount.moduleId,
          installation: mount.key,
          at: mount.at,
        },
      }
      if (parent) {
        parent.children = parent.children ?? []
        parent.children.push(mountNode)
      } else {
        acc.routeTree.push(mountNode)
      }
    }
  }

  /**
   * Rejects mounted module routes whose final full paths collide with routes
   * of this package or of other mounted modules.
   */
  private checkRouteModuleFullPaths(acc: HandleNodeAccumulator) {
    const context = this.routeModuleContext
    if (!context || context.mounts.length === 0) {
      return
    }
    const owners = new Map<string, string>()
    const claim = (fullPath: string, owner: string) => {
      const key = fullPath === '/' ? '/' : fullPath.replace(/\/$/, '')
      const previous = owners.get(key)
      if (previous !== undefined && previous !== owner) {
        throw new Error(
          `[route modules] ${context.declaration.packageName}: the full path "${fullPath}" is used by both ${previous} and ${owner}. Mount the module at another path.`,
        )
      }
      owners.set(key, owner)
    }
    for (const node of acc.routeNodes) {
      if (!node.children?.length && node._fsRouteType !== 'lazy') {
        claim(inferFullPath(node), `"${node.filePath}"`)
      }
    }
    for (const mount of context.mounts) {
      const mountNode = this.findMountNode(acc, mount.key)
      const parentPath = mountNode.parent
        ? inferFullPath(mountNode.parent).replace(/\/$/, '')
        : ''
      const prefix = `${parentPath}${mount.at ?? ''}`
      for (const route of mount.manifest.routes) {
        if (!route.leaf) {
          continue
        }
        const local = route.fullPath
        claim(
          prefix === ''
            ? local
            : local === '/'
              ? `${prefix}/`
              : `${prefix}${local}`,
          `"${getInstallationRouteId(mount, route.id)}" (module "${mount.key}")`,
        )
      }
    }
  }

  /**
   * A module that uses another one without mounting it links into it through
   * a namespace typed without the path params above it: they are filled from
   * the current location. That always works only when the routes declaring
   * them are above the using module too.
   */
  private checkRouteModuleHostParams(acc: HandleNodeAccumulator) {
    const context = this.routeModuleContext
    if (!context || context.mounts.length === 0) {
      return
    }
    const mountPaths = this.getRouteModuleMountPaths(acc)
    for (const mount of context.mounts) {
      const host = this.findMountNode(acc, mount.key).parent
      const hostParams = new Set(
        getParamNames(
          parseSegments(false, { from: host ? inferFullPath(host) : '' }, 0),
        ),
      )
      for (const route of mount.manifest.routes) {
        const overlap = getParamNames(
          parseSegments(false, { from: route.fullPath }, 0),
        ).find((param) => hostParams.has(param))
        if (overlap) {
          throw new Error(
            `[route modules] ${context.declaration.packageName}: parameter "${overlap}" appears both above "${mount.key}" and in its route "${route.id}". Choose distinct host and module parameter names.`,
          )
        }
      }
      for (const installed of mount.manifest.modules) {
        const own = mountPaths.get(
          installed.id === mount.moduleId ? mount.key : installed.key,
        )!
        for (const used of installed.uses) {
          if (
            context.mounts.some(
              (candidate) =>
                candidate.moduleId === used && candidate.as !== undefined,
            )
          ) {
            // Links into one of several installations: see
            // `getRouteModuleUses`.
            if (installed.id !== mount.moduleId) {
              throw new Error(
                `[route modules] ${context.declaration.packageName}: "${installed.id}" links into "${used}", which this application installs several times, but "${installed.id}" is installed by "${mount.moduleId}", which cannot choose an installation. Install "${installed.id}" in this application.`,
              )
            }
            continue
          }
          const target = mountPaths.get(used)
          if (target === undefined) {
            continue
          }
          const host = getHostPath(target)
          if (host === undefined) {
            continue
          }
          if (own !== host && !own.startsWith(`${host}/`)) {
            throw new Error(
              `[route modules] ${context.declaration.packageName}: "${installed.id}" links into "${used}", which is mounted below "${host}", but "${installed.id}" is mounted at "${own}" and cannot fill those path params. Mount "${installed.id}" below "${host}", or link into "${used}" from the package that mounts it.`,
            )
          }
        }
      }
    }
  }

  /**
   * Full paths of every installed module root in this route tree, by module
   * id, and by `<moduleId>#<as>` for the installations of a module installed
   * several times.
   */
  private getRouteModuleMountPaths(acc: HandleNodeAccumulator) {
    const mountPaths = new Map<string, string>()
    for (const mount of this.routeModuleContext?.mounts ?? []) {
      const mountNode = this.findMountNode(acc, mount.key)
      const parentPath = mountNode.parent
        ? inferFullPath(mountNode.parent).replace(/\/$/, '')
        : ''
      const prefix = `${parentPath}${mount.at ?? ''}`
      for (const installed of mount.manifest.modules) {
        const local = installed.mountPath.replace(/\/$/, '')
        mountPaths.set(
          installed.id === mount.moduleId ? mount.key : installed.key,
          `${prefix}${local}` || '/',
        )
      }
    }
    return mountPaths
  }

  /**
   * The installation a mounted module links into for every module it uses
   * that this application installs several times: the one whose host routes
   * are above the module, so that links fill their path params from the
   * current location. None or several such installations are errors.
   */
  private getRouteModuleUses(acc: HandleNodeAccumulator) {
    const context = this.routeModuleContext
    const uses = new Map<string, Record<string, string>>()
    if (!context || !context.mounts.some((mount) => mount.as !== undefined)) {
      return uses
    }
    const mountPaths = this.getRouteModuleMountPaths(acc)
    for (const mount of context.mounts) {
      const own = mountPaths.get(mount.key)!
      const root = mount.manifest.modules.find(
        (installed) => installed.id === mount.moduleId,
      )
      for (const used of root?.uses ?? []) {
        if (
          !context.mounts.some(
            (candidate) =>
              candidate.moduleId === used && candidate.as !== undefined,
          )
        ) {
          continue
        }
        const installations = context.mounts.filter((candidate) => {
          if (candidate.moduleId !== used) {
            return false
          }
          const host = getHostPath(mountPaths.get(candidate.key)!)
          return (
            host === undefined || own === host || own.startsWith(`${host}/`)
          )
        })
        if (installations.length !== 1) {
          throw new Error(
            `[route modules] ${context.declaration.packageName}: "${mount.key}" links into "${used}", which is installed several times, but ${
              installations.length === 0
                ? 'no installation'
                : `the installations ${installations.map((installation) => `"${installation.as}"`).join(' and ')}`
            } can take path params from "${own}". Mount "${mount.key}" below the routes with the path params of exactly one installation.`,
          )
        }
        uses.set(mount.key, {
          ...uses.get(mount.key),
          [used]: installations[0]!.key,
        })
      }
    }
    return uses
  }

  private findMountNode(acc: HandleNodeAccumulator, installation: string) {
    const find = (nodes: Array<RouteNode>): RouteNode | undefined => {
      for (const node of nodes) {
        if (node._routeModuleMount?.installation === installation) {
          return node
        }
        const found = node.children && find(node.children)
        if (found) {
          return found
        }
      }
      return undefined
    }
    return find(acc.routeTree)!
  }

  /**
   * Generated files of route modules and of applications that mount them are
   * type-checked (mount assertions, declaration emit), so the default header
   * leaves out `@ts-nocheck`. A custom header is used as is.
   */
  private getGeneratedFileHeader(config: Config): Array<string> {
    const header = config.routeTreeFileHeader
    if (
      !this.routeModuleContext ||
      config.disableTypes ||
      header.length !== DEFAULT_ROUTE_TREE_FILE_HEADER.length ||
      header.some((line, i) => line !== DEFAULT_ROUTE_TREE_FILE_HEADER[i])
    ) {
      return header
    }
    return header.filter((line) => line !== '// @ts-nocheck')
  }

  /** Path of a generated route-module file next to the route tree. */
  private getRouteModuleFilePath(baseName: string) {
    return path.join(
      path.dirname(this.generatedRouteTreePath),
      `${baseName}.ts`,
    )
  }

  /** Import specifier of a generated route-module file from `fromFile`. */
  private getRouteModuleImport(fromFile: string, baseName: string) {
    const relative = replaceBackslash(
      removeExt(
        path.relative(
          path.dirname(fromFile),
          this.getRouteModuleFilePath(baseName),
        ),
        this.config.addExtensions,
      ),
    )
    return relative.startsWith('.') ? relative : `./${relative}`
  }

  /**
   * In a route module, route files get qualified ids and import their route
   * factories from the module's scope.
   */
  private getRouteFileModuleScope(
    node: RouteNode,
  ): { routeId: string; importSource: string } | undefined {
    const context = this.routeModuleContext
    if (context?.declaration.mode !== 'module') {
      return undefined
    }
    const moduleId = context.declaration.moduleId!
    return {
      routeId:
        node._fsRouteType === '__root'
          ? `${moduleId}:`
          : `${moduleId}:${node.routePath ?? ''}`,
      importSource: this.getRouteModuleImport(node.fullPath, ROUTE_SCOPE_FILE),
    }
  }

  public async getCrawlingResult(): Promise<CrawlingResult | undefined> {
    await this.runPromise
    return this.crawlingResult
  }

  private static handleNode(
    node: RouteNode,
    acc: HandleNodeAccumulator,
    prefixMap: RoutePrefixMap,
    config?: Config,
  ) {
    let parentRoute = hasParentRoute(prefixMap, node, node.routePath)

    // Check routeNodesByPath for a closer parent that may not be in prefixMap.
    //
    // Why: The prefixMap excludes lazy routes by design. When lazy-only routes are
    // nested inside a pathless layout, the virtual route created from the lazy file
    // won't be in the prefixMap, but it will be in routeNodesByPath.
    //
    // Example: Given files _layout/path.lazy.tsx and _layout/path.index.lazy.tsx:
    //   - prefixMap contains: /_layout (from route.tsx)
    //   - routeNodesByPath contains: /_layout AND /_layout/path (virtual from lazy)
    //   - For /_layout/path/, hasParentRoute returns /_layout (wrong)
    //   - But the correct parent is /_layout/path (the virtual route from path.lazy.tsx)
    //
    // We walk up the path segments to find the closest registered parent. This handles
    // cases where multiple path segments (e.g., $a/$b) don't have intermediate routes.
    if (node.routePath) {
      let searchPath = node.routePath
      while (searchPath.length > 0) {
        const lastSlash = searchPath.lastIndexOf('/')
        if (lastSlash <= 0) break

        searchPath = searchPath.substring(0, lastSlash)
        const candidate = acc.routeNodesByPath.get(searchPath)
        if (candidate && candidate.routePath !== node.routePath) {
          // Found a parent in routeNodesByPath
          // If it's different from what prefixMap found AND is a closer match, use it
          if (candidate !== parentRoute) {
            // Check if this candidate is a closer parent than what prefixMap found
            // (longer path prefix means closer parent)
            if (
              !parentRoute ||
              (candidate.routePath?.length ?? 0) >
                (parentRoute.routePath?.length ?? 0)
            ) {
              parentRoute = candidate
            }
          }
          break
        }
      }
    }

    // Virtual routes may have an explicit parent from virtual config.
    // If we can find that exact parent, use it to prevent auto-nesting siblings
    // based on path prefix matching (#5822, #5431).
    if (node._virtualParentRoutePath !== undefined) {
      const explicitParent = acc.routeNodesByPath.get(
        node._virtualParentRoutePath,
      )
      if (explicitParent) {
        parentRoute = explicitParent
      } else if (node._virtualParentRoutePath === `/${rootPathId}`) {
        // The explicit parent is the root route (handled separately).
        // Override path-based inference so this node stays at root level.
        parentRoute = null
      }
      // Otherwise the explicit parent was a virtual file-less route that got
      // filtered out. Fall back to the path-based parentRoute already computed.
    }

    if (parentRoute) node.parent = parentRoute

    node.path = determineNodePath(node)

    const trimmedPath = trimPathLeft(node.path ?? '')
    const originalPath =
      node.originalRoutePath && node.parent?.originalRoutePath
        ? node.originalRoutePath.replace(node.parent.originalRoutePath, '') ||
          '/'
        : node.originalRoutePath
    const routePathSegmentMetadata = getRoutePathSegmentMetadataForPath(
      node,
      node.path ?? '/',
      node.parent?.routePath,
    )
    const trimmedOriginalPath = trimPathLeft(originalPath ?? '')

    const split = trimmedPath.split('/')
    const pathSplit = (node.path ?? '').split('/')
    const originalSplit = trimmedOriginalPath.split('/')
    const lastRouteSegment = split[split.length - 1] ?? trimmedPath
    const lastOriginalSegment =
      originalSplit[originalSplit.length - 1] ?? trimmedOriginalPath
    const lastRouteSegmentMetadata =
      routePathSegmentMetadata?.[pathSplit.length - 1]

    // A segment is non-path if it starts with underscore AND the underscore is not escaped
    node.isNonPath =
      (!lastRouteSegmentMetadata?.literalLeadingUnderscore &&
        isSegmentPathless(lastRouteSegment, lastOriginalSegment)) ||
      split.every((part) => this.routeGroupPatternRegex.test(part))

    // Use a single pass so layout removal does not desync escaped underscore checks.
    node.cleanedPath = removeGroups(
      removeLayoutSegmentsAndUnderscoresWithEscape(
        node.path,
        originalPath,
        routePathSegmentMetadata,
      ),
    )

    if (
      node._fsRouteType === 'layout' ||
      node._fsRouteType === 'pathless_layout'
    ) {
      node.cleanedPath = removeTrailingSlash(node.cleanedPath)
    }

    if (
      !node.isVirtual &&
      (
        [
          'lazy',
          'loader',
          'component',
          'pendingComponent',
          'errorComponent',
          'notFoundComponent',
        ] satisfies Array<FsRouteType>
      ).some((d) => d === node._fsRouteType)
    ) {
      acc.routePiecesByPath[node.routePath!] =
        acc.routePiecesByPath[node.routePath!] || {}

      const pieceKey =
        node._fsRouteType === 'lazy'
          ? 'lazy'
          : (node._fsRouteType as keyof (typeof acc.routePiecesByPath)[string])
      acc.routePiecesByPath[node.routePath!]![pieceKey] = node

      const anchorRoute = acc.routeNodesByPath.get(node.routePath!)

      // Don't create virtual routes for root route component pieces - the root route is handled separately
      if (!anchorRoute && node.routePath !== `/${rootPathId}`) {
        this.handleNode(
          {
            ...node,
            isVirtual: true,
            _fsRouteType: 'static',
          },
          acc,
          prefixMap,
          config,
        )
      }
      return
    }

    const isPathlessLayoutWithPath =
      node._fsRouteType === 'pathless_layout' &&
      node.cleanedPath &&
      node.cleanedPath.length > 0

    // Special handling: pathless layouts with path need to find real ancestor
    if (!node.isVirtual && isPathlessLayoutWithPath) {
      const immediateParentPath =
        removeLastSegmentFromPath(node.routePath) || '/'
      const immediateParentOriginalPath =
        removeLastSegmentFromPath(node.originalRoutePath) || '/'
      let searchPath = immediateParentPath

      // Find nearest real (non-virtual, non-index) parent
      while (searchPath) {
        const candidate = acc.routeNodesByPath.get(searchPath)
        if (candidate && !candidate.isVirtual && candidate.path !== '/') {
          node.parent = candidate
          node.path =
            node.routePath?.replace(candidate.routePath ?? '', '') || '/'
          const pathRelativeToParent =
            immediateParentPath.replace(candidate.routePath ?? '', '') || '/'
          const originalPathRelativeToParent =
            immediateParentOriginalPath.replace(
              candidate.originalRoutePath ?? '',
              '',
            ) || '/'
          const routePathSegmentMetadataRelativeToParent =
            getRoutePathSegmentMetadataForPath(
              node,
              pathRelativeToParent,
              candidate.routePath,
            )
          node.cleanedPath = removeGroups(
            removeLayoutSegmentsAndUnderscoresWithEscape(
              pathRelativeToParent,
              originalPathRelativeToParent,
              routePathSegmentMetadataRelativeToParent,
            ),
          )
          break
        }
        if (searchPath === '/') break
        searchPath = removeLastSegmentFromPath(searchPath) || '/'
      }
    }

    // Add to parent's children or to root
    if (node.parent) {
      node.parent.children = node.parent.children ?? []
      node.parent.children.push(node)
    } else {
      acc.routeTree.push(node)
    }

    acc.routeNodes.push(node)
    if (node.routePath) {
      // Always register routes by path so child routes can find parents.
      // Virtual routes (created from lazy-only files) also need to be registered
      // so that index routes like path.index.lazy.tsx can find their parent path.lazy.tsx.
      // If a non-virtual route is later processed for the same path, it will overwrite.
      acc.routeNodesByPath.set(node.routePath, node)
    }
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

    // package.json and the manifests of route modules this package mounts or
    // uses: they change the generated route-module files
    if (this.routeModuleFiles.includes(filePath)) {
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
