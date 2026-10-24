import chokidar from 'chokidar'
import {
  Generator,
  getConfig,
  resolveConfigPath,
  watchRouteFiles,
} from '@tanstack/router-generator'
import type { RouteFileWatcher } from '@tanstack/router-generator'

export function watch(root: string) {
  const configPath = resolveConfigPath({
    configDirectory: root,
  })
  const configWatcher = chokidar.watch(configPath)

  let watcher: Promise<RouteFileWatcher> | undefined

  const report = (run: Promise<void>) =>
    run.catch((err: unknown) => {
      console.error(err)
      console.info()
    })

  const generatorWatcher = async () => {
    const config = getConfig()
    const generator = new Generator({ config, root })

    const previous = watcher
    watcher = undefined
    await (await previous)?.close()

    console.info(`TSR: Watching routes (${config.routesDirectory})...`)
    await report(generator.run())
    // Every route file event under the routes directory and the
    // `physical()` mounts, and edits of the virtual route config
    watcher = watchRouteFiles(generator, (run) => void report(run))
  }

  configWatcher.on('ready', generatorWatcher)
  configWatcher.on('change', generatorWatcher)
}
