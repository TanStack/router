import { createReactRefreshIgnoredRouteExportsPlugin } from './react-refresh-ignored-route-exports'
import { createReactRefreshRouteComponentsPlugin } from './react-refresh-route-components'
import { createStableHmrSplitRouteComponentsPlugin } from './react-stable-hmr-split-route-components'
import { createOctaneSplitRouteComponentsPlugin } from './octane-split-route-components'
import { createOctaneHmrSplitRouteComponentsPlugin } from './octane-hmr-split-route-components'
import type { CodeSplitCompilerPlugin } from '../plugins'
import type { Config, HmrStyle } from '../../config'

export function getFrameworkHmrCompilerPlugins(opts: {
  targetFramework: Config['target']
  hmrStyle?: HmrStyle
}): Array<CodeSplitCompilerPlugin> | undefined {
  switch (opts.targetFramework) {
    case 'react': {
      const hmrStyle = opts.hmrStyle ?? 'vite'
      return [
        ...(hmrStyle === 'vite'
          ? [createReactRefreshIgnoredRouteExportsPlugin()]
          : []),
        createReactRefreshRouteComponentsPlugin(),
        createStableHmrSplitRouteComponentsPlugin({ hmrStyle }),
      ]
    }
    case 'octane': {
      return [
        createStableHmrSplitRouteComponentsPlugin({
          hmrStyle: opts.hmrStyle ?? 'vite',
        }),
        createOctaneHmrSplitRouteComponentsPlugin({
          hmrStyle: opts.hmrStyle ?? 'vite',
        }),
      ]
    }
    default:
      return undefined
  }
}

export function getFrameworkCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrStyle?: HmrStyle
}): Array<CodeSplitCompilerPlugin> | undefined {
  const plugins = [
    ...(opts.targetFramework === 'octane'
      ? [createOctaneSplitRouteComponentsPlugin()]
      : []),
    ...(opts.addHmr ? (getFrameworkHmrCompilerPlugins(opts) ?? []) : []),
  ]
  return plugins.length > 0 ? plugins : undefined
}

export function getReferenceRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrStyle?: HmrStyle
}): Array<CodeSplitCompilerPlugin> | undefined {
  return getFrameworkCompilerPlugins(opts)
}

export function getVirtualRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrStyle?: HmrStyle
}): Array<CodeSplitCompilerPlugin> | undefined {
  const plugins = getFrameworkCompilerPlugins(opts)?.filter(
    (plugin) =>
      plugin.onVirtualRouteSplitNode || plugin.onExportSplitRouteProperty,
  )
  return plugins?.length ? plugins : undefined
}
