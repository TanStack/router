import path from 'path'
import fs from 'fs-extra'
import { z } from 'zod'

const configSchema = z.object({
  routeFilePrefix: z.string().optional(),
  routeFileIgnorePrefix: z.string().optional(),
  routesDirectory: z.string(),
  generatedRouteTree: z.string(),
})

export type Config = z.infer<typeof configSchema>

const configFilePathJson = path.resolve(process.cwd(), 'tsr.config.json')

export async function getConfig() {
  const config = (await fs.readJson(configFilePathJson)) as unknown as Config

  return configSchema.parse(config)
}
