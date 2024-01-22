import { Plugin } from 'vite'
import { join, normalize } from 'path'
import { readFile } from 'fs/promises'
import {
  type Config,
  configSchema,
  getConfig,
  generator,
} from '@tanstack/router-generator'

const CONFIG_FILE_NAME = 'tsr.config.json'

type UserConfig = Partial<Config>

async function buildConfig(config: UserConfig): Promise<Config> {
  const tsrConfig = await getConfig();
  return {
    ...tsrConfig,
    ...config
  };
}

export function TanStackRouterVite(inlineConfig: UserConfig = {}): Plugin {
  let ROOT: string
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
    configResolved: async (vite) => {
      ROOT = vite.root
      userConfig = await buildConfig(inlineConfig)
      await generate()
    },
    handleHotUpdate: async ({ file }) => {
      const filePath = normalize(file)
      if (filePath === join(ROOT, CONFIG_FILE_NAME)) {
        userConfig = await buildConfig(inlineConfig)
        return
      }
      if (filePath.startsWith(join(ROOT, userConfig.routesDirectory))) {
        await generate()
      }
    },
  }
}
