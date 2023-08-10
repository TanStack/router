import path from 'path'
import fs from 'fs-extra'

export type Config = {
  rootDirectory: string
  sourceDirectory: string
  routesDirectory: string
  routeGenDirectory: string
}

const configFilePathJson = path.resolve(process.cwd(), 'tsr.config.json')

export async function getConfig() {
  return fs.readJson(configFilePathJson)
}
