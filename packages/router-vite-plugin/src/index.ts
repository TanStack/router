import { isAbsolute, join, normalize } from 'path'
import { type Config, generator, getConfig } from '@tanstack/router-generator'
import type { Plugin } from 'vite'

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

  const handleFile = async (file: string) => {
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
  }

  return {
    name: 'vite-plugin-tanstack-router',
    configResolved: async () => {
      userConfig = await getConfig(inlineConfig, ROOT)
      await generate()
    },
    handleHotUpdate: async ({ file }) => {
      await handleFile(file)
    },
    watchChange: async (file) => {
      await handleFile(file)
    },
  }
}
