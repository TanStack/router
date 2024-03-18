import { Plugin } from 'vite'
import { join, normalize, isAbsolute } from 'path'
import { type Config, getConfig, generator } from '@tanstack/router-generator'

const CONFIG_FILE_NAME = 'tsr.config.json'

export function TanStackRouterVite(inlineConfig: Partial<Config> = {}): Plugin {
  const ROOT: string = process.cwd()
  let userConfig: Config

  const generate = async () => {
    try {
      await generator(userConfig)
    } catch (err) {
      console.error(err)
      console.info()
    }
  }

  return {
    name: 'vite-plugin-tanstack-router',
    configResolved: async () => {
      userConfig = await getConfig(inlineConfig, ROOT)
      await generate()
    },
    handleHotUpdate: async ({ file }) => {
      const filePath = normalize(file)
      if (filePath === join(ROOT, CONFIG_FILE_NAME)) {
        userConfig = await getConfig(inlineConfig, ROOT)
        return
      }
      const routesDirectoryPath = isAbsolute(userConfig.routesDirectory)
        ? userConfig.routesDirectory
        : join(ROOT, userConfig.routesDirectory)
      if (filePath.startsWith(routesDirectoryPath)) {
        await generate()
      }
    },
  }
}
