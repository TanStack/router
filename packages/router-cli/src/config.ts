import path from 'path'

export type Config = {
  rootDirectory: string
  sourceDirectory: string
  routesDirectory: string
  routeGenDirectory: string
}

const configFilePath = path.resolve(process.cwd(), 'tsr.config.js')

export function getConfig() {
  return require(configFilePath) as Config
}

export function getFreshConfig() {
  delete require.cache[configFilePath]
  return getConfig()
}
