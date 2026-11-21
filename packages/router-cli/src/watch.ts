import chokidar from 'chokidar'
import {
  Generator,
  createGeneratorSession,
  getConfig,
  resolveConfigPath,
} from '@tanstack/router-generator'
import type { GeneratorSession } from '@tanstack/router-generator'

export function watch(root: string) {
  const configPath = resolveConfigPath({
    configDirectory: root,
  })
  const configWatcher = chokidar.watch(configPath)

  let session: GeneratorSession | undefined

  const generatorWatcher = async () => {
    const config = getConfig()
    const generator = new Generator({ config, root })

    await session?.close()

    console.info(`TSR: Watching routes (${config.routesDirectory})...`)
    // Every route file event under the routes directory and the
    // `physical()` mounts, and edits of the virtual route config
    session = createGeneratorSession({
      generator: () => generator,
      report: (err) => {
        console.error(err)
        console.info()
      },
    })
    await session.watch()
  }

  configWatcher.on('ready', generatorWatcher)
  configWatcher.on('change', generatorWatcher)
}
