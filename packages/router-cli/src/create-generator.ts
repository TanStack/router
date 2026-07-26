import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Generator } from '@tanstack/router-generator'
import type { Config, GeneratorPlugin } from '@tanstack/router-generator'

type OctaneGeneratorPluginModule = {
  octaneRouteGeneratorPlugin?: () => GeneratorPlugin
}

export async function createGenerator(config: Config, root: string) {
  const frameworkPlugins = await getFrameworkGeneratorPlugins(config, root)

  return new Generator({
    config: {
      ...config,
      plugins: [...frameworkPlugins, ...(config.plugins ?? [])],
    },
    root,
  })
}

async function getFrameworkGeneratorPlugins(
  config: Config,
  root: string,
): Promise<Array<GeneratorPlugin>> {
  if (config.target !== 'octane') {
    return []
  }

  const requireFromProject = createRequire(path.resolve(root, 'package.json'))
  let pluginPath: string

  try {
    pluginPath = requireFromProject.resolve(
      '@tanstack/octane-router/generator-plugin',
    )
  } catch (cause) {
    throw new Error(
      'The Octane router target requires `@tanstack/octane-router` to be installed in the project.',
      { cause },
    )
  }

  const pluginModule = (await import(
    /* @vite-ignore */ pathToFileURL(pluginPath).href
  )) as OctaneGeneratorPluginModule

  if (typeof pluginModule.octaneRouteGeneratorPlugin !== 'function') {
    throw new Error(
      '`@tanstack/octane-router/generator-plugin` does not export `octaneRouteGeneratorPlugin`.',
    )
  }

  return [pluginModule.octaneRouteGeneratorPlugin()]
}
