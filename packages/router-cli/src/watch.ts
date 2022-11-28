import chokidar from 'chokidar'
import path from 'path'
import { getFreshConfig } from './config'
import { generator } from './generator'

export function watch() {
  const configWatcher = chokidar.watch(
    path.resolve(process.cwd(), 'tsr.config.js'),
  )

  let watcher = new chokidar.FSWatcher()

  configWatcher.on('change', () => {
    const config = getFreshConfig()

    watcher.close()

    watcher = chokidar.watch(config.routesDirectory)

    watcher.on('ready', async () => {
      try {
        await generator(config)
      } catch (err) {
        console.error(err)
      }

      const handle = async () => {
        try {
          await generator(config)
        } catch (err) {
          console.error(err)
        }
      }

      watcher.on('change', handle)
      watcher.on('add', handle)
      watcher.on('addDir', handle)
      watcher.on('unlink', handle)
      watcher.on('unlinkDir', handle)
    })
  })
}
