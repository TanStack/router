import { createReactRefreshIgnoredRouteExportsPlugin } from './react-refresh-ignored-route-exports'
import { createReactRefreshRouteComponentsPlugin } from './react-refresh-route-components'
import { createReactStableHmrSplitRouteComponentsPlugin } from './react-stable-hmr-split-route-components'
import type { CodeSplitCompilerPlugin } from '../plugins'
import type { Config } from '../../config'
import type { HmrStyle } from '../../hmr'

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
        createReactStableHmrSplitRouteComponentsPlugin({ hmrStyle }),
      ]
    }
    default:
      return undefined
  }
}
