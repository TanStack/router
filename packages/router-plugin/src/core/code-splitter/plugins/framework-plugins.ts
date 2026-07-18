import { createReactRefreshIgnoredRouteExportsPlugin } from './react-refresh-ignored-route-exports'
import { createReactRefreshRouteComponentsPlugin } from './react-refresh-route-components'
import { createStableHmrSplitRouteComponentsPlugin } from './react-stable-hmr-split-route-components'
import { createOctaneSplitRouteComponentsPlugin } from './octane-split-route-components'
import { createOctaneHmrSplitRouteComponentsPlugin } from './octane-hmr-split-route-components'
import type {
  ReferenceRouteCompilerPlugin,
  VirtualRouteCompilerPlugin,
} from '../plugins'
import type { Config, HmrStyle } from '../../config'

export function getReferenceRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrStyle?: HmrStyle
}): Array<ReferenceRouteCompilerPlugin> | undefined {
  switch (opts.targetFramework) {
    case 'react': {
      if (opts.addHmr) {
        const hmrStyle = opts.hmrStyle ?? 'vite'
        return [
          ...(hmrStyle === 'vite'
            ? [createReactRefreshIgnoredRouteExportsPlugin()]
            : []),
          createReactRefreshRouteComponentsPlugin(),
          createStableHmrSplitRouteComponentsPlugin({ hmrStyle }),
        ]
      }
      return undefined
    }
    case 'octane': {
      return [
        createOctaneSplitRouteComponentsPlugin(),
        ...(opts.addHmr
          ? [
              createStableHmrSplitRouteComponentsPlugin({
                hmrStyle: opts.hmrStyle ?? 'vite',
              }),
            ]
          : []),
      ]
    }
    default:
      return undefined
  }
}

export function getVirtualRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrStyle?: HmrStyle
}): Array<VirtualRouteCompilerPlugin> | undefined {
  if (opts.targetFramework !== 'octane' || !opts.addHmr) {
    return undefined
  }

  return [
    createOctaneHmrSplitRouteComponentsPlugin({
      hmrStyle: opts.hmrStyle ?? 'vite',
    }),
  ]
}
