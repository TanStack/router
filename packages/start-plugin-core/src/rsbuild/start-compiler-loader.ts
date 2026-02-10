import fs, { promises as fsp } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  KindDetectionPatterns,
  LookupKindsPerEnv,
  StartCompiler,
  detectKindsInCode,
} from '../start-compiler-plugin/compiler'
import { cleanId } from '../start-compiler-plugin/utils'
import type { LookupConfig } from '../start-compiler-plugin/compiler'
import type { CompileStartFrameworkOptions } from '../types'
import type {
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../start-compiler-plugin/types'

type LoaderOptions = {
  env: 'client' | 'server'
  envName: string
  root: string
  framework: CompileStartFrameworkOptions
  providerEnvName: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  manifestPath?: string
}

const compilers = new Map<string, StartCompiler>()
const serverFnsById: Record<string, ServerFn> = {}
const require = createRequire(import.meta.url)
const appendServerFnsToManifest = (
  manifestPath: string,
  data: Record<string, ServerFn>,
) => {
  if (!manifestPath || Object.keys(data).length === 0) return
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.appendFileSync(manifestPath, `${JSON.stringify(data)}\n`)
}

export const getServerFnsById = () => serverFnsById
export const resetServerFnCompilerState = () => {
  compilers.clear()
  for (const key of Object.keys(serverFnsById)) {
    delete serverFnsById[key]
  }
}

// Derive transform code filter from KindDetectionPatterns (single source of truth)
function getTransformCodeFilterForEnv(env: 'client' | 'server'): Array<RegExp> {
  const validKinds = LookupKindsPerEnv[env]
  const patterns: Array<RegExp> = []
  for (const [kind, pattern] of Object.entries(KindDetectionPatterns) as Array<
    [keyof typeof KindDetectionPatterns, RegExp]
  >) {
    if (validKinds.has(kind)) {
      patterns.push(pattern)
    }
  }
  return patterns
}

const getLookupConfigurationsForEnv = (
  env: 'client' | 'server',
  framework: CompileStartFrameworkOptions,
): Array<LookupConfig> => {
  const commonConfigs: Array<LookupConfig> = [
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerFn',
      kind: 'Root',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createIsomorphicFn',
      kind: 'Root',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createServerOnlyFn',
      kind: 'Root',
    },
    {
      libName: `@tanstack/${framework}-start`,
      rootExport: 'createClientOnlyFn',
      kind: 'Root',
    },
  ]

  if (env === 'client') {
    return [
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createMiddleware',
        kind: 'Root',
      },
      {
        libName: `@tanstack/${framework}-start`,
        rootExport: 'createStart',
        kind: 'Root',
      },
      ...commonConfigs,
    ]
  }

  return [
    ...commonConfigs,
    {
      libName: `@tanstack/${framework}-router`,
      rootExport: 'ClientOnly',
      kind: 'ClientOnlyJSX',
    },
  ]
}

function shouldTransformCode(code: string, env: 'client' | 'server') {
  const patterns = getTransformCodeFilterForEnv(env)
  return patterns.some((pattern) => pattern.test(code))
}

async function resolveId(
  loaderContext: any,
  source: string,
  importer?: string,
): Promise<string | null> {
  const baseContext = importer
    ? path.dirname(cleanId(importer))
    : loaderContext.context
  const resolveContext =
    source.startsWith('.') || source.startsWith('/')
      ? baseContext
      : loaderContext.rootContext || baseContext

  return new Promise((resolve) => {
    const resolver =
      loaderContext.getResolve?.({
        conditionNames: ['import', 'module', 'default'],
      }) ?? loaderContext.resolve

    try {
      resolver(resolveContext, source, (err: Error | null, result?: string) => {
        if (!err && result) {
          resolve(cleanId(result))
          return
        }
        try {
          const resolved = require.resolve(source, {
            paths: [
              baseContext,
              loaderContext.rootContext || loaderContext.context,
            ].filter(Boolean),
          })
          resolve(cleanId(resolved))
        } catch {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

async function loadModule(
  compiler: StartCompiler,
  loaderContext: any,
  id: string,
) {
  const cleaned = cleanId(id)
  const resolvedPath =
    (await resolveId(loaderContext, cleaned)) ??
    (path.isAbsolute(cleaned) ? cleaned : null)

  if (!resolvedPath || resolvedPath.includes('\0')) return

  try {
    const code = await fsp.readFile(resolvedPath, 'utf-8')
    compiler.ingestModule({ code, id: resolvedPath })
  } catch {
    // ignore missing files
  }
}

export default function startCompilerLoader(this: any, code: string, map: any) {
  const callback = this.async()
  const options = this.getOptions() as LoaderOptions

  const env = options.env
  const envName = options.envName
  const root = options.root || process.cwd()
  const framework = options.framework
  const providerEnvName = options.providerEnvName
  const manifestPath = options.manifestPath

  const shouldTransform = shouldTransformCode(code, env)
  if (!shouldTransform) {
    callback(null, code, map)
    return
  }

  let compiler = compilers.get(envName)
  if (!compiler) {
    const mode =
      this.mode === 'production' ||
      this._compiler?.options?.mode === 'production'
        ? 'build'
        : 'dev'
    const shouldPersistManifest = Boolean(manifestPath) && mode === 'build'
    const onServerFnsById = (d: Record<string, ServerFn>) => {
      Object.assign(serverFnsById, d)
      if (shouldPersistManifest && manifestPath) {
        appendServerFnsToManifest(manifestPath, d)
      }
    }

    compiler = new StartCompiler({
      env,
      envName,
      root,
      lookupKinds: LookupKindsPerEnv[env],
      lookupConfigurations: getLookupConfigurationsForEnv(env, framework),
      mode,
      framework,
      providerEnvName,
      generateFunctionId: options.generateFunctionId,
      onServerFnsById,
      getKnownServerFns: () => serverFnsById,
      loadModule: async (id: string) => loadModule(compiler!, this, id),
      resolveId: async (source: string, importer?: string) =>
        resolveId(this, source, importer),
    })
    compilers.set(envName, compiler)
  }

  const detectedKinds = detectKindsInCode(code, env)
  const resourceQuery =
    typeof this.resourceQuery === 'string' ? this.resourceQuery : ''
  const baseResource =
    typeof this.resource === 'string' ? this.resource : this.resourcePath
  const resourceId =
    resourceQuery && !baseResource.includes(resourceQuery)
      ? `${baseResource}${resourceQuery}`
      : baseResource
  compiler
    .compile({
      id: resourceId,
      code,
      detectedKinds,
    })
    .then((result) => {
      if (!result) {
        callback(null, code, map)
        return
      }
      callback(null, result.code, result.map ?? map)
    })
    .catch((error) => {
      callback(error)
    })
}
