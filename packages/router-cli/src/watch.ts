import chokidar from 'chokidar'
import {
  Generator,
  createGeneratorSession,
  getConfig,
  resolveConfigPath,
} from '@tanstack/router-generator'
import type { GeneratorSession } from '@tanstack/router-generator'

const report = (err: unknown) => {
  console.error(err)
  console.info()
}

/**
 * `tsr watch`: a generator session with the config of `root`, started again
 * whenever its config file changes or is created (a save that replaces the
 * file can come as its removal, then its creation). One start at a time: a
 * config saved during a start makes one more start after it, with the config
 * then on disk.
 */
export function watch(root: string) {
  const configPath = resolveConfigPath({
    configDirectory: root,
  })
  const configWatcher = chokidar.watch(configPath)

  let session: GeneratorSession | undefined
  let closed = false

  const start = async () => {
    await session?.close()
    session = undefined
    if (closed) {
      return
    }
    const config = getConfig({}, root)
    const generator = new Generator({ config, root })

    console.info(`TSR: Watching routes (${config.routesDirectory})...`)
    // Every route file event under the routes directory and the
    // `physical()` mounts, and edits of the virtual route config
    session = createGeneratorSession({
      generator: () => generator,
      report,
    })
    await session.watch()
  }

  let starts = Promise.resolve()
  let queued = false
  const restart = () => {
    if (queued) {
      return
    }
    queued = true
    starts = starts
      .then(() => {
        queued = false
        return start()
      })
      .catch(report)
  }

  configWatcher.on('error', report)
  configWatcher.on('ready', () => {
    restart()
    // (the config file found by the initial scan is the start's)
    configWatcher.on('add', restart)
  })
  configWatcher.on('change', restart)

  return {
    /** Stops watching the config and the routes. */
    async close() {
      closed = true
      await configWatcher.close()
      await starts
      await session?.close()
    },
  }
}
