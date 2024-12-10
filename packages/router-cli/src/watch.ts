import chokidar from 'chokidar'
import {
  generator,
  getConfig,
  resolveConfigPath,
} from '@tanstack/router-generator'

export function watch(root: string) {
  const configPath = resolveConfigPath({
    configDirectory: root,
  })
  const configWatcher = chokidar.watch(configPath)

  let watcher = new chokidar.FSWatcher({})

  const generatorWatcher = () => {
    const config = getConfig()

    watcher.close()

    console.info(`TSR: Watching routes (${config.routesDirectory})...`)
    watcher = chokidar.watch(config.routesDirectory)

    watcher.on('ready', async () => {
      const handle = async () => {
        try {
          await generator(config, root)
        } catch (err) {
          console.error(err)
          console.info()
        }
      }

      await handle()

      let timeout: ReturnType<typeof setTimeout> | undefined

      const deduped = (_file: string) => {
        if (timeout) {
          clearTimeout(timeout)
        }

        timeout = setTimeout(handle, 10)
      }

      watcher.on('change', deduped)
      watcher.on('add', deduped)
      watcher.on('unlink', deduped)
    })
  }

  configWatcher.on('ready', generatorWatcher)
  configWatcher.on('change', generatorWatcher)
}
