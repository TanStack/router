import { isAbsolute, join, normalize, resolve } from 'node:path'
import { createUnplugin } from 'unplugin'
import { generator } from '@tanstack/router-generator'

import { getConfig } from './config'
import { CONFIG_FILE_NAME } from './constants'
import type { Config } from './config'
import type { UnpluginFactory } from 'unplugin'

let lock = false
const checkLock = () => lock
const setLock = (bool: boolean) => {
  lock = bool
}

const unpluginFactory: UnpluginFactory<Partial<Config> | undefined> = (
  options = {},
) => {
  let ROOT: string = process.cwd()
  let userConfig = options as Config

  const generate = async () => {
    if (checkLock()) {
      return
    }

    setLock(true)

    try {
      await generator(userConfig)
    } catch (err) {
      console.error(err)
      console.info()
    } finally {
      setLock(false)
    }
  }

  const handleFile = async (
    file: string,
    event: 'create' | 'update' | 'delete',
  ) => {
    const filePath = normalize(file)

    if (filePath === join(ROOT, CONFIG_FILE_NAME)) {
      userConfig = await getConfig(options, ROOT)
      return
    }

    if (
      event === 'update' &&
      filePath === resolve(userConfig.generatedRouteTree)
    ) {
      // skip generating routes if the generated route tree is updated
      return
    }

    const routesDirectoryPath = isAbsolute(userConfig.routesDirectory)
      ? userConfig.routesDirectory
      : join(ROOT, userConfig.routesDirectory)

    if (filePath.startsWith(routesDirectoryPath)) {
      await generate()
    }
  }

  const run: (cb: () => Promise<void> | void) => Promise<void> = async (cb) => {
    if (userConfig.enableRouteGeneration ?? true) {
      await cb()
    }
  }

  return {
    name: 'router-generator-plugin',
    async watchChange(id, { event }) {
      await run(async () => {
        await handleFile(id, event)
      })
    },
    vite: {
      async configResolved(config) {
        ROOT = config.root
        userConfig = await getConfig(options, ROOT)

        await run(generate)
      },
    },
  }
}

export const unpluginRouterGenerator =
  /* #__PURE__ */ createUnplugin(unpluginFactory)
