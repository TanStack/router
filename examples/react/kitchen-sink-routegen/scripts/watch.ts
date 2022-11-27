import chokidar from 'chokidar'
import { config } from './config'
import { generate } from './generator'

main()

async function main() {
  const watcher = chokidar.watch(config.routesDirectory, {})

  watcher.on('ready', async () => {
    try {
      await generate()
    } catch (err) {
      console.error(err)
    }

    const handle = async () => {
      try {
        await generate()
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
}
