import path from 'path'
import chokidar from 'chokidar'
import { generator, getConfig } from '@tanstack/router-generator'

export async function watch() {
  const configWatcher = chokidar.watch(
    path.resolve(process.cwd(), 'tsr.config.json'),
  )

  let watcher = new chokidar.FSWatcher({})

  const generatorWatcher = async () => {
    const config = await getConfig()

    watcher.close()

    console.info(`TSR: Watching routes (${config.routesDirectory})...`)
    watcher = chokidar.watch(config.routesDirectory)

    watcher.on('ready', async () => {
      const handle = async () => {
        try {
          await generator(config)
        } catch (err) {
          console.error(err)
          console.info()
        }
      }

      await handle()

      let timeout: ReturnType<typeof setTimeout> | undefined

      const deduped = (file: string) => {
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
