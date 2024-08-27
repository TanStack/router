import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

export const configSchema = z.object({
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
  apiBase: z.string().optional().default('/api'),
  routeTreeFileHeader: z
    .array(z.string())
    .optional()
    .default([
      '/* prettier-ignore-start */',
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
    ]),
  routeTreeFileFooter: z
    .array(z.string())
    .optional()
    .default(['/* prettier-ignore-end */']),
  autoCodeSplitting: z.boolean().optional(),
  experimental: z
    .object({
      // TODO: Remove this option in the next major release (v2).
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
})

export type Config = z.infer<typeof configSchema>

export function getConfig(
  inlineConfig: Partial<Config> = {},
  configDirectory?: string,
): Config {
  if (configDirectory === undefined) {
    configDirectory = process.cwd()
  }
  const configFilePathJson = path.resolve(configDirectory, 'tsr.config.json')
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

  return config
}
