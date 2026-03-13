import { createReactRefreshRouteComponentsPlugin } from './react-refresh-route-components'
import type { ReferenceRouteCompilerPlugin } from '../plugins'
import type { Config } from '../../config'

export function getReferenceRouteCompilerPlugins(opts: {
  targetFramework: Config['target']
  addHmr?: boolean
}): Array<ReferenceRouteCompilerPlugin> | undefined {
  switch (opts.targetFramework) {
    case 'react': {
      if (opts.addHmr) {
        return [createReactRefreshRouteComponentsPlugin()]
      }
      return undefined
    }
    default:
      return undefined
  }
}
