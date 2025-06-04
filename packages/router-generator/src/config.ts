import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { virtualRootRouteSchema } from './filesystem/virtual/config'

export const configSchema = z.object({
  target: z.enum(['react', 'solid']).optional().default('react'),
  virtualRouteConfig: virtualRootRouteSchema.or(z.string()).optional(),
  routeFilePrefix: z.string().optional(),
  routeFileIgnorePrefix: z.string().optional().default('-'),
  routeFileIgnorePattern: z.string().optional(),
  routesDirectory: z.string().optional().default('./src/routes'),
  generatedRouteTree: z.string().optional().default('./src/routeTree.gen.ts'),
  quoteStyle: z.enum(['single', 'double']).optional().default('single'),
  semicolons: z.boolean().optional().default(false),
  disableTypes: z.boolean().optional().default(false),
  addExtensions: z.boolean().optional().default(false),
  disableLogging: z.boolean().optional().default(false),
  disableManifestGeneration: z.boolean().optional().default(false),
  enableRouteTreeFormatting: z.boolean().optional().default(true),
  __enableAPIRoutesGeneration: z.boolean().optional(), // Internal flag to be turned on for TanStack Start
  apiBase: z.string().optional().default('/api'),
  routeTreeFileHeader: z
    .array(z.string())
    .optional()
    .default([
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
    ]),
  routeTreeFileFooter: z.array(z.string()).optional().default([]),
  autoCodeSplitting: z.boolean().optional(),
  indexToken: z.string().optional().default('index'),
  routeToken: z.string().optional().default('route'),
  pathParamsAllowedCharacters: z
    .array(z.enum([';', ':', '@', '&', '=', '+', '$', ',']))
    .optional(),
  customScaffolding: z
    .object({
      routeTemplate: z.string().optional(),
      lazyRouteTemplate: z.string().optional(),
      apiTemplate: z.string().optional(),
    })
    .optional(),
  experimental: z
    .object({
      // TODO: This has been made stable and is now "autoCodeSplitting". Remove in next major version.
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>

type ResolveParams = {
  configDirectory: string
}

export function resolveConfigPath({ configDirectory }: ResolveParams) {
  return path.resolve(configDirectory, 'tsr.config.json')
}

export function getConfig(
  inlineConfig: Partial<Config> = {},
  configDirectory?: string,
): Config {
  if (configDirectory === undefined) {
    configDirectory = process.cwd()
  }
  const configFilePathJson = resolveConfigPath({ configDirectory })
  const exists = existsSync(configFilePathJson)

  let config: Config

  if (exists) {
    config = configSchema.parse({
      ...JSON.parse(readFileSync(configFilePathJson, 'utf-8')),
      ...inlineConfig,
    })
  } else {
    config = configSchema.parse(inlineConfig)
  }

  // If typescript is disabled, make sure the generated route tree is a .js file
  if (config.disableTypes) {
    config.generatedRouteTree = config.generatedRouteTree.replace(
      /\.(ts|tsx)$/,
      '.js',
    )
  }

  // if a configDirectory is used, paths should be relative to that directory
  if (configDirectory) {
    // if absolute configDirectory is provided, use it as the root
    if (path.isAbsolute(configDirectory)) {
      config.routesDirectory = path.resolve(
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        configDirectory,
        config.generatedRouteTree,
      )
    } else {
      config.routesDirectory = path.resolve(
        process.cwd(),
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        process.cwd(),
        configDirectory,
        config.generatedRouteTree,
      )
    }
  }

  validateConfig(config)
  return config
}

function validateConfig(config: Config) {
  if (typeof config.experimental?.enableCodeSplitting !== 'undefined') {
    const message = `
------
⚠️ ⚠️ ⚠️
ERROR: The "experimental.enableCodeSplitting" flag has been made stable and is now "autoCodeSplitting". Please update your configuration file to use "autoCodeSplitting" instead of "experimental.enableCodeSplitting".
------
`
    console.error(message)
    throw new Error(message)
  }

  if (config.indexToken === config.routeToken) {
    throw new Error(
      `The "indexToken" and "routeToken" options must be different.`,
    )
  }

  if (
    config.routeFileIgnorePrefix &&
    config.routeFileIgnorePrefix.trim() === '_'
  ) {
    throw new Error(
      `The "routeFileIgnorePrefix" cannot be an underscore ("_"). This is a reserved character used to denote a pathless route. Please use a different prefix.`,
    )
  }

  return config
}
