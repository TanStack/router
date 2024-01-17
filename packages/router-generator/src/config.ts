import path from 'path'
import { readFileSync, existsSync } from 'fs'
import { z } from 'zod'

export const configSchema = z.object({
  routeFilePrefix: z.string().optional(),
  routeFileIgnorePrefix: z.string().optional().default('-'),
  routesDirectory: z.string().optional().default('./src/routes'),
  generatedRouteTree: z.string().optional().default('./src/routeTree.gen.ts'),
  quoteStyle: z.enum(['single', 'double']).optional().default('single'),
})

export type Config = z.infer<typeof configSchema>

const configFilePathJson = path.resolve(process.cwd(), 'tsr.config.json')

export async function getConfig(): Promise<Config> {
  const exists = existsSync(configFilePathJson)

  if (exists) {
    return configSchema.parse(
      JSON.parse(readFileSync(configFilePathJson, 'utf-8')),
    )
  }

  return configSchema.parse({})
}
