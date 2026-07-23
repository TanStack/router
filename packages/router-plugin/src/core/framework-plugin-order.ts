import type { Config } from './config'

type TransformationPluginInfo = {
  pluginNames: Array<string>
  pkg: string
  usage: string
  order: 'before-router' | 'after-router'
  required?: boolean
}

/**
 * Framework source transformation plugins and their required ordering relative
 * to route analysis.
 */
const TRANSFORMATION_PLUGINS_BY_FRAMEWORK: Partial<
  Record<Config['target'], Array<TransformationPluginInfo>>
> = {
  react: [
    {
      // Babel-based React plugin
      pluginNames: ['vite:react-babel', 'vite:react-refresh'],
      pkg: '@vitejs/plugin-react',
      usage: 'react()',
      order: 'after-router',
    },
    {
      // SWC-based React plugin
      pluginNames: ['vite:react-swc', 'vite:react-swc:resolve-runtime'],
      pkg: '@vitejs/plugin-react-swc',
      usage: 'reactSwc()',
      order: 'after-router',
    },
    {
      // OXC-based React plugin (deprecated but should still be handled)
      pluginNames: ['vite:react-oxc:config', 'vite:react-oxc:refresh-runtime'],
      pkg: '@vitejs/plugin-react-oxc',
      usage: 'reactOxc()',
      order: 'after-router',
    },
  ],
  solid: [
    {
      pluginNames: ['solid'],
      pkg: 'vite-plugin-solid',
      usage: 'solid()',
      order: 'after-router',
    },
  ],
  octane: [
    {
      pluginNames: ['octane'],
      pkg: 'octane/compiler/vite',
      usage: 'octane()',
      order: 'before-router',
      required: true,
    },
  ],
}

export function validateFrameworkPluginOrder(opts: {
  framework: Config['target']
  plugins: ReadonlyArray<{ name: string }>
  routerPluginName: string
}): void {
  const routerPluginIndex = opts.plugins.findIndex(
    (plugin) => plugin.name === opts.routerPluginName,
  )
  if (routerPluginIndex === -1) {
    return
  }

  const frameworkPlugins = TRANSFORMATION_PLUGINS_BY_FRAMEWORK[opts.framework]
  if (!frameworkPlugins) {
    return
  }

  for (const transformPlugin of frameworkPlugins) {
    const transformPluginIndex = opts.plugins.findIndex((plugin) =>
      transformPlugin.pluginNames.includes(plugin.name),
    )

    if (transformPluginIndex === -1) {
      if (transformPlugin.required) {
        throw new Error(
          `Plugin setup error: '${transformPlugin.pkg}' is required for the '${opts.framework}' target.\n\n` +
            `Please update your Vite config:\n\n` +
            `  plugins: [\n` +
            `    ${transformPlugin.usage},\n` +
            `    tanstackRouter(),\n` +
            `  ]\n`,
        )
      }
      continue
    }

    const shouldComeBeforeRouter = transformPlugin.order === 'before-router'
    const isMisordered = shouldComeBeforeRouter
      ? transformPluginIndex > routerPluginIndex
      : transformPluginIndex < routerPluginIndex

    if (!isMisordered) {
      continue
    }

    const firstPlugin = shouldComeBeforeRouter
      ? transformPlugin.usage
      : 'tanstackRouter()'
    const secondPlugin = shouldComeBeforeRouter
      ? 'tanstackRouter()'
      : transformPlugin.usage
    throw new Error(
      `Plugin order error: '${transformPlugin.pkg}' is placed ${shouldComeBeforeRouter ? 'after' : 'before'} '@tanstack/router-plugin'.\n\n` +
        `${shouldComeBeforeRouter ? 'This framework compiler must lower its source syntax before TanStack Router analyzes route modules.' : 'The TanStack Router plugin must analyze route modules before JSX transformation plugins.'}\n\n` +
        `Please update your Vite config:\n\n` +
        `  plugins: [\n` +
        `    ${firstPlugin},\n` +
        `    ${secondPlugin},\n` +
        `  ]\n`,
    )
  }
}
