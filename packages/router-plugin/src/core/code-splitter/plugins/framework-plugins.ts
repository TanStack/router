import { createReactRefreshIgnoredRouteExportsPlugin } from './react-refresh-ignored-route-exports'
import { createReactRefreshRouteComponentsPlugin } from './react-refresh-route-components'
import { createReactStableHmrSplitRouteComponentsPlugin } from './react-stable-hmr-split-route-components'
import type { ReferenceRouteCompilerPlugin } from '../plugins'
import type { Config } from '../../config'

export function getReferenceRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
  hmrHotExpression?: string
}): Array<ReferenceRouteCompilerPlugin> | undefined {
  switch (opts.targetFramework) {
    case 'react': {
      if (opts.addHmr) {
        return [
          createReactRefreshIgnoredRouteExportsPlugin({
            hotExpression: opts.hmrHotExpression,
          }),
          createReactRefreshRouteComponentsPlugin(),
          createReactStableHmrSplitRouteComponentsPlugin({
            hotExpression: opts.hmrHotExpression,
          }),
        ]
      }
      return undefined
    }
    default:
      return undefined
  }
}
