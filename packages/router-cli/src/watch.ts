import chokidar from 'chokidar'
import path from 'path'
import { getConfig } from './config'
import { generator } from './generator'

export async function watch() {
  const configWatcher = chokidar.watch(
    path.resolve(process.cwd(), 'tsr.config.js'),
  )

  let watcher = new chokidar.FSWatcher()

  const generatorWatcher = async () => {
    const config = await getConfig()

    watcher.close()

    console.log(`TSR: Watching routes (${config.routesDirectory})...`)
    watcher = chokidar.watch(config.routesDirectory)

    watcher.on('ready', async () => {
      try {
        await generator(config)
      } catch (err) {
        console.error(err)
        console.log()
      }

      const handle = async () => {
        try {
          await generator(config)
        } catch (err) {
          console.error(err)
          console.log()
        }
      }

      watcher.on('change', handle)
      watcher.on('add', handle)
      watcher.on('addDir', handle)
      watcher.on('unlink', handle)
      watcher.on('unlinkDir', handle)
    })
  }

  configWatcher.on('ready', generatorWatcher)
  configWatcher.on('change', generatorWatcher)
}
