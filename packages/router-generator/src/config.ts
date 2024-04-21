import path from 'path'
import { existsSync, readFileSync } from 'fs'
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
})

export type Config = z.infer<typeof configSchema>

export async function getConfig(
  inlineConfig: Partial<Config> = {},
  configDirectory?: string,
): Promise<Config> {
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

  return config
}
