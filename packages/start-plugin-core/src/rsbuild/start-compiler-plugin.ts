import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { createRspackPlugin } from 'unplugin'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import {
  getServerFnsById,
  resetServerFnCompilerState,
} from './start-compiler-loader'
import type { ServerFn } from '../start-compiler-plugin/types'

const SERVER_FN_MANIFEST_FILE = 'tanstack-start-server-fn-manifest.json'
export const SERVER_FN_MANIFEST_TEMP_FILE =
  'tanstack-start-server-fn-manifest.temp.jsonl'

const readTempManifest = async (manifestPath: string) => {
  try {
    const raw = await fsp.readFile(manifestPath, 'utf-8')
    return raw
      .split('\n')
      .filter(Boolean)
      .reduce<Record<string, ServerFn>>((acc, line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, ServerFn>
          Object.assign(acc, parsed)
        } catch {
          return acc
        }
        return acc
      }, {})
  } catch {
    return {}
  }
}

const normalizeIdentifier = (value: unknown) =>
  `${value ?? ''}`.replace(/\\/g, '/')

const isJsFile = (file: unknown): file is string =>
  typeof file === 'string' && file.endsWith('.js')

type CompilationModule = {
  id?: string | number
  [key: string]: any
}

const getChunkFiles = (chunk: any) => {
  const files = [
    ...Array.from(chunk?.files ?? []),
    ...Array.from(chunk?.auxiliaryFiles ?? []),
  ]
  return files.filter((file) => typeof file === 'string')
}

const getModuleIdentifiers = (module: any) =>
  [
    module.identifier,
    module.name,
    module.nameForCondition,
    module.resource,
    module.moduleIdentifier,
  ]
    .filter(Boolean)
    .map((value) => normalizeIdentifier(value))

const getCompilationModuleIdentifiers = (module: any) =>
  [
    module.resource,
    module.userRequest,
    module.request,
    typeof module.identifier === 'function'
      ? module.identifier()
      : module.identifier,
    module.debugId,
  ]
    .filter(Boolean)
    .map((value) => normalizeIdentifier(value))

function generateManifestModule(
  serverFnsById: Record<string, ServerFn>,
  includeClientReferencedCheck: boolean,
): string {
  const manifestEntries = Object.entries(serverFnsById)
    .map(([id, fn]) => {
      const baseEntry = `${JSON.stringify(id)}: {
                functionName: ${JSON.stringify(fn.functionName)},
        importer: () => import(${JSON.stringify(fn.extractedFilename)})${
          includeClientReferencedCheck
            ? `,
        isClientReferenced: ${fn.isClientReferenced ?? true}`
            : ''
        }
      }`
      return baseEntry
    })
    .join(',')

  const getServerFnByIdParams = includeClientReferencedCheck ? 'id, opts' : 'id'
  const clientReferencedCheck = includeClientReferencedCheck
    ? `
      if (opts?.fromClient && !serverFnInfo.isClientReferenced) {
        throw new Error('Server function not accessible from client: ' + id)
      }
`
    : ''

  return `
    const manifest = {${manifestEntries}}

    export async function getServerFnById(${getServerFnByIdParams}) {
              const serverFnInfo = manifest[id]
              if (!serverFnInfo) {
                throw new Error('Server function info not found for ' + id)
              }
${clientReferencedCheck}
              const fnModule = await serverFnInfo.importer()

              if (!fnModule) {
                console.info('serverFnInfo', serverFnInfo)
                throw new Error('Server function module not resolved for ' + id)
              }

              let action = fnModule[serverFnInfo.functionName]
              if (action?.serverFnMeta?.id && action.serverFnMeta.id !== id) {
                action = undefined
              }
              if (!action) {
                const fallbackAction = Object.values(fnModule).find(
                  (candidate) =>
                    candidate?.serverFnMeta?.id &&
                    candidate.serverFnMeta.id === id,
                )
                if (fallbackAction) {
                  action = fallbackAction
                }
              }
              if (Array.isArray(globalThis.__tssServerFnHandlers)) {
                const globalMatch = globalThis.__tssServerFnHandlers.find(
                  (candidate) =>
                    candidate?.serverFnMeta?.id &&
                    candidate.serverFnMeta.id === id,
                )
                if (globalMatch && (!action || action.__executeServer)) {
                  action = globalMatch
                }
              }

              if (!action) {
                console.info('serverFnInfo', serverFnInfo)
                console.info('fnModule', fnModule)

                throw new Error(
                  \`Server function module export not resolved for serverFn ID: \${id}\`,
                )
              }
              return action
            }
          `
}

function generateManifestModuleFromFile(
  manifestPath: string,
  includeClientReferencedCheck: boolean,
): string {
  const getServerFnByIdParams = includeClientReferencedCheck ? 'id, opts' : 'id'
  const clientReferencedCheck = includeClientReferencedCheck
    ? `
      if (opts?.fromClient && !serverFnInfo.isClientReferenced) {
        throw new Error('Server function not accessible from client: ' + id)
      }
`
    : ''

  return `
    import fs from 'node:fs'
    import { pathToFileURL } from 'node:url'

    let cached
    const getManifest = () => {
      if (cached) return cached
      try {
        const raw = fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf-8')
        cached = JSON.parse(raw)
        return cached
      } catch (error) {
        return {}
      }
    }

    export async function getServerFnById(${getServerFnByIdParams}) {
              const manifest = getManifest()
              const serverFnInfo = manifest[id]
              if (!serverFnInfo) {
                throw new Error('Server function info not found for ' + id)
              }
${clientReferencedCheck}
              let fnModule
              if (typeof __webpack_require__ === 'function' && serverFnInfo.importerModuleId != null) {
                const chunkIds = Array.isArray(serverFnInfo.importerChunkIds)
                  ? serverFnInfo.importerChunkIds
                  : []
                if (chunkIds.length > 0 && typeof __webpack_require__.e === 'function') {
                  await Promise.all(chunkIds.map((chunkId) => __webpack_require__.e(chunkId)))
                }
                fnModule = __webpack_require__(serverFnInfo.importerModuleId)
              } else {
                const importerPath = serverFnInfo.importerPath ?? serverFnInfo.extractedFilename
                fnModule = await import(/* webpackIgnore: true */ pathToFileURL(importerPath).href)
              }

              if (!fnModule) {
                console.info('serverFnInfo', serverFnInfo)
                throw new Error('Server function module not resolved for ' + id)
              }

              let action = fnModule[serverFnInfo.functionName]
              if (action?.serverFnMeta?.id && action.serverFnMeta.id !== id) {
                action = undefined
              }
              if (!action) {
                const fallbackAction = Object.values(fnModule).find(
                  (candidate) =>
                    candidate?.serverFnMeta?.id &&
                    candidate.serverFnMeta.id === id,
                )
                if (fallbackAction) {
                  action = fallbackAction
                }
              }
              if (Array.isArray(globalThis.__tssServerFnHandlers)) {
                const globalMatch = globalThis.__tssServerFnHandlers.find(
                  (candidate) =>
                    candidate?.serverFnMeta?.id &&
                    candidate.serverFnMeta.id === id,
                )
                if (globalMatch && (!action || action.__executeServer)) {
                  action = globalMatch
                }
              }

              if (!action) {
                console.info('serverFnInfo', serverFnInfo)
                console.info('fnModule', fnModule)

                throw new Error(
                  \`Server function module export not resolved for serverFn ID: \${id}\`,
                )
              }
              return action
            }
          `
}

export function createServerFnManifestRspackPlugin(opts: {
  serverOutputDir: string
}) {
  const tempManifestPath = path.join(
    opts.serverOutputDir,
    SERVER_FN_MANIFEST_TEMP_FILE,
  )

  return {
    apply(compiler: any) {
      const resetManifestState = async () => {
        resetServerFnCompilerState()
        await fsp.rm(tempManifestPath, { force: true })
      }
      compiler.hooks.beforeRun.tapPromise(
        'tanstack-start:server-fn-manifest',
        resetManifestState,
      )
      compiler.hooks.watchRun.tapPromise(
        'tanstack-start:server-fn-manifest',
        resetManifestState,
      )
      compiler.hooks.afterEmit.tapPromise(
        'tanstack-start:server-fn-manifest',
        async (compilation: any) => {
          const serverFnsById = getServerFnsById()
          const fileServerFnsById = await readTempManifest(tempManifestPath)
          const mergedServerFnsById = {
            ...serverFnsById,
            ...fileServerFnsById,
          }
          const stats = compilation?.getStats?.()
          const statsJson = stats?.toJson?.({
            all: false,
            assets: true,
            chunks: true,
            chunkModules: true,
            moduleAssets: true,
            modules: true,
          })
          const chunks = statsJson?.chunks ?? []
          const chunksById = new Map(
            chunks.map((chunk: any) => [chunk.id, getChunkFiles(chunk)]),
          )
          const chunkModuleEntries = chunks.flatMap((chunk: any) => {
            const chunkFiles = getChunkFiles(chunk)
            const chunkModules = chunk.modules ?? []
            return chunkModules.flatMap((module: any) =>
              getModuleIdentifiers(module).map((identifier) => ({
                identifier,
                files: chunkFiles,
              })),
            )
          })
          const modules = statsJson?.modules ?? []
          const compilationModules: Array<CompilationModule> = Array.from(
            compilation?.modules ?? [],
          )
          const chunkGraph = compilation?.chunkGraph
          const moduleGraph = compilation?.moduleGraph
          const compilationEntries = compilationModules.flatMap(
            (module: any) => {
              const identifiers = getCompilationModuleIdentifiers(module)
              if (identifiers.length === 0) return []
              const chunkFiles = chunkGraph
                ? Array.from(
                    chunkGraph.getModuleChunksIterable(module) ?? [],
                  ).flatMap((chunk: any) => getChunkFiles(chunk))
                : []
              return identifiers.map((identifier) => ({
                identifier,
                files: chunkFiles,
              }))
            },
          )
          const assetFiles = (statsJson?.assets ?? [])
            .map((asset: any) => asset.name ?? asset)
            .filter((name: string) => typeof name === 'string')
            .filter((name: string) => name.endsWith('.js'))
          const getAssetContent = async (assetName: string) => {
            const assetFromCompilation =
              (typeof compilation?.getAsset === 'function'
                ? compilation.getAsset(assetName)?.source
                : undefined) ??
              compilation?.assets?.[assetName] ??
              (typeof compilation?.assets?.get === 'function'
                ? compilation.assets.get(assetName)
                : undefined)
            const sourceValue =
              assetFromCompilation &&
              typeof assetFromCompilation.source === 'function'
                ? assetFromCompilation.source()
                : assetFromCompilation
            if (typeof sourceValue === 'string') return sourceValue
            if (Buffer.isBuffer(sourceValue)) {
              return sourceValue.toString('utf-8')
            }
            if (sourceValue && typeof sourceValue.toString === 'function') {
              return sourceValue.toString()
            }
            try {
              const assetPath = path.join(opts.serverOutputDir, assetName)
              return await fsp.readFile(assetPath, 'utf-8')
            } catch {
              return undefined
            }
          }
          const findAssetMatch = async (searchTokens: Array<string>) => {
            for (const assetName of assetFiles) {
              const content = await getAssetContent(assetName)
              if (!content) continue
              if (searchTokens.some((token) => content.includes(token))) {
                return assetName
              }
            }
            return undefined
          }
          const manifestWithImporters: Record<string, ServerFn> = {}
          for (const [id, info] of Object.entries(mergedServerFnsById)) {
            const normalizedExtracted = info.extractedFilename.replace(
              /\\/g,
              '/',
            )
            const normalizedFilename = info.filename.replace(/\\/g, '/')
            const searchTokens = [
              normalizedExtracted,
              normalizedFilename,
              path.basename(normalizedExtracted),
              path.basename(normalizedFilename),
              id,
              info.functionName,
            ].filter(Boolean)
            const matchedModuleByExtracted = modules.find((module: any) =>
              getModuleIdentifiers(module).some((identifier) =>
                identifier.includes(normalizedExtracted),
              ),
            )
            const matchedModuleByFilename = modules.find((module: any) =>
              getModuleIdentifiers(module).some((identifier) =>
                identifier.includes(normalizedFilename),
              ),
            )
            const matchedModule =
              matchedModuleByExtracted ?? matchedModuleByFilename
            const chunkIds =
              matchedModule?.chunks ?? matchedModule?.chunkIds ?? []
            const statsModuleId = matchedModule?.id ?? matchedModule?.moduleId
            const chunkFiles = chunkIds.flatMap((chunkId: any) => {
              return chunksById.get(chunkId) ?? []
            })
            const moduleAssets = Array.isArray(matchedModule?.assets)
              ? matchedModule.assets
              : matchedModule?.assets
                ? Object.keys(matchedModule.assets)
                : []
            const matchedCompilationModuleByExtracted = compilationModules.find(
              (module) =>
                getCompilationModuleIdentifiers(module).some((identifier) =>
                  identifier.includes(normalizedExtracted),
                ),
            )
            const matchedCompilationModuleByFilename = compilationModules.find(
              (module) =>
                getCompilationModuleIdentifiers(module).some((identifier) =>
                  identifier.includes(normalizedFilename),
                ),
            )
            const matchedCompilationModule =
              matchedCompilationModuleByExtracted ??
              matchedCompilationModuleByFilename
            const exportsInfo = matchedCompilationModule
              ? moduleGraph?.getExportsInfo?.(matchedCompilationModule)
              : null
            const providedExports =
              exportsInfo?.getProvidedExports?.() ??
              (Array.isArray(exportsInfo?.exports)
                ? exportsInfo.exports
                    .map((exportInfo: any) => exportInfo.name)
                    .filter(Boolean)
                : [])
            const resolvedFunctionName =
              Array.isArray(providedExports) && providedExports.length === 1
                ? providedExports[0]
                : undefined
            const compilationChunkIds =
              matchedCompilationModule && chunkGraph
                ? Array.from(
                    chunkGraph.getModuleChunksIterable(
                      matchedCompilationModule,
                    ),
                  )
                    .map((chunk: any) => chunk.id)
                    .filter(
                      (chunkId: any) =>
                        chunkId !== undefined && chunkId !== null,
                    )
                : []
            const compilationModuleId =
              matchedCompilationModule?.id ??
              (matchedCompilationModule && chunkGraph?.getModuleId
                ? chunkGraph.getModuleId(matchedCompilationModule)
                : undefined)
            const compilationFiles =
              compilationEntries.find((entry) => {
                return entry.identifier.includes(normalizedExtracted)
              })?.files ??
              compilationEntries.find((entry) => {
                return entry.identifier.includes(normalizedFilename)
              })?.files ??
              []
            const chunkModuleFiles =
              chunkFiles.length > 0
                ? chunkFiles
                : (chunkModuleEntries.find((entry: any) => {
                    return (
                      entry.identifier.includes(normalizedExtracted) ||
                      entry.identifier.includes(normalizedFilename)
                    )
                  })?.files ?? [])
            const jsFile = chunkFiles.find(isJsFile)
            const fallbackJsFile =
              jsFile ??
              chunkModuleFiles.find(isJsFile) ??
              compilationFiles.find(isJsFile) ??
              moduleAssets.find(isJsFile)
            let importerPath = jsFile
              ? path.join(opts.serverOutputDir, jsFile)
              : fallbackJsFile
                ? path.join(opts.serverOutputDir, fallbackJsFile)
                : undefined
            if (!importerPath) {
              const assetMatch = await findAssetMatch(searchTokens)
              importerPath = assetMatch
                ? path.join(opts.serverOutputDir, assetMatch)
                : undefined
            }

            manifestWithImporters[id] = {
              ...info,
              functionName: resolvedFunctionName ?? info.functionName,
              importerPath,
              importerChunkIds:
                chunkIds.length > 0
                  ? chunkIds
                  : compilationChunkIds.length > 0
                    ? compilationChunkIds
                    : undefined,
              importerModuleId:
                statsModuleId ?? compilationModuleId ?? undefined,
            }
          }
          const extractExportName = (
            content: string,
            moduleId: string | number,
            functionId: string,
          ) => {
            const marker = `${moduleId}:function`
            const startIndex = content.indexOf(marker)
            const scope =
              startIndex === -1
                ? content
                : content.slice(startIndex, startIndex + 4000)
            const idIndex = scope.indexOf(functionId)
            if (idIndex === -1) return undefined
            const beforeId = scope.slice(Math.max(0, idIndex - 300), idIndex)
            const assignmentMatches = Array.from(
              beforeId.matchAll(/([A-Za-z_$][\w$]*)=(?!>)/g),
            )
            const handlerVar =
              assignmentMatches[assignmentMatches.length - 1]?.[1]
            if (!handlerVar) return undefined
            const escapedHandlerVar = handlerVar.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&',
            )
            const exportMatch = scope.match(
              new RegExp(
                `([A-Za-z_$][\\\\w$]*):\\\\(\\\\)=>${escapedHandlerVar}`,
              ),
            )
            return exportMatch?.[1]
          }
          const findExportName = async (
            moduleId: string | number,
            functionId: string,
            preferredAssetName?: string,
          ) => {
            if (preferredAssetName) {
              const content = await getAssetContent(preferredAssetName)
              const resolved = content
                ? extractExportName(content, moduleId, functionId)
                : undefined
              if (resolved) return resolved
            }
            for (const assetName of assetFiles) {
              if (assetName === preferredAssetName) continue
              const content = await getAssetContent(assetName)
              if (!content) continue
              const resolved = extractExportName(content, moduleId, functionId)
              if (resolved) return resolved
            }
            return undefined
          }
          const extractModuleIdFromContent = (
            content: string,
            functionId: string,
          ) => {
            const idIndex = content.indexOf(functionId)
            if (idIndex === -1) return undefined
            const beforeId = content.slice(Math.max(0, idIndex - 1500), idIndex)
            const matches = Array.from(
              beforeId.matchAll(/(?:^|[,{])\s*([0-9]+)\s*:\s*(?:function|\()/g),
            )
            const moduleId = matches[matches.length - 1]?.[1]
            if (!moduleId) return undefined
            return Number.isNaN(Number(moduleId)) ? moduleId : Number(moduleId)
          }
          const parseChunkIdFromAssetName = (assetName: string) => {
            const base = path.basename(assetName, path.extname(assetName))
            if (!base) return undefined
            return /^\d+$/.test(base) ? Number(base) : undefined
          }
          const findModuleIdByFunctionId = async (
            functionId: string,
            preferredAssetName?: string,
          ) => {
            if (preferredAssetName) {
              const content = await getAssetContent(preferredAssetName)
              if (content) {
                const moduleId = extractModuleIdFromContent(content, functionId)
                if (moduleId !== undefined) {
                  return {
                    moduleId,
                    assetName: preferredAssetName,
                  }
                }
              }
            }
            for (const assetName of assetFiles) {
              if (assetName === preferredAssetName) continue
              const content = await getAssetContent(assetName)
              if (!content) continue
              const moduleId = extractModuleIdFromContent(content, functionId)
              if (moduleId !== undefined) {
                return { moduleId, assetName }
              }
            }
            return undefined
          }
          for (const info of Object.values(manifestWithImporters)) {
            const importerAssetName = info.importerPath
              ? path
                  .relative(opts.serverOutputDir, info.importerPath)
                  .replace(/\\/g, '/')
              : undefined
            if (info.importerModuleId == null) {
              const moduleMatch = await findModuleIdByFunctionId(
                info.functionId,
                importerAssetName,
              )
              if (moduleMatch) {
                info.importerModuleId = moduleMatch.moduleId
                if (!info.importerPath) {
                  info.importerPath = path.join(
                    opts.serverOutputDir,
                    moduleMatch.assetName,
                  )
                }
                if (!info.importerChunkIds) {
                  const chunkId = parseChunkIdFromAssetName(
                    moduleMatch.assetName,
                  )
                  if (chunkId !== undefined) {
                    info.importerChunkIds = [chunkId]
                  }
                }
              }
            }
            if (info.importerModuleId == null) continue
            const resolvedName = await findExportName(
              info.importerModuleId,
              info.functionId,
              importerAssetName,
            )
            if (resolvedName) {
              info.functionName = resolvedName
            }
          }
          const manifestPath = path.join(
            opts.serverOutputDir,
            SERVER_FN_MANIFEST_FILE,
          )
          await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
          await fsp.writeFile(
            manifestPath,
            JSON.stringify(manifestWithImporters),
            'utf-8',
          )
          await fsp.rm(tempManifestPath, { force: true })
        },
      )
    },
  }
}

export function createServerFnResolverPlugin(opts: {
  environmentName: string
  providerEnvName: string
  serverOutputDir?: string
}) {
  const ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
  const includeClientReferencedCheck = !ssrIsProvider
  const manifestPath = opts.serverOutputDir
    ? path.join(opts.serverOutputDir, SERVER_FN_MANIFEST_FILE)
    : null
  const tempManifestPath = opts.serverOutputDir
    ? path.join(opts.serverOutputDir, SERVER_FN_MANIFEST_TEMP_FILE)
    : null

  const pluginFactory = createRspackPlugin(() => ({
    name: `tanstack-start-core:server-fn-resolver:${opts.environmentName}`,
    resolveId(id) {
      if (id === VIRTUAL_MODULES.serverFnResolver) {
        return id
      }
      return null
    },
    async load(id) {
      if (id !== VIRTUAL_MODULES.serverFnResolver) return null
      if (opts.environmentName !== opts.providerEnvName) {
        return `export { getServerFnById } from '@tanstack/start-server-core/server-fn-ssr-caller'`
      }
      const serverFnsById = getServerFnsById()
      const fileServerFnsById = tempManifestPath
        ? await readTempManifest(tempManifestPath)
        : {}
      const mergedServerFnsById = {
        ...serverFnsById,
        ...fileServerFnsById,
      }
      if (Object.keys(mergedServerFnsById).length > 0) {
        return generateManifestModule(
          mergedServerFnsById,
          includeClientReferencedCheck,
        )
      }
      if (manifestPath) {
        return generateManifestModuleFromFile(
          manifestPath,
          includeClientReferencedCheck,
        )
      }
      return generateManifestModule(serverFnsById, includeClientReferencedCheck)
    },
  }))
  return pluginFactory()
}
