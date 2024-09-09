import type { PeerDependency } from '../types'
// do not import at build time since router peer dependencies will still be '*'
const packageJson = require('../../package.json')

export function getDependenciesWithVersion(deps: Array<PeerDependency>) {
  return deps.reduce(
    (acc, dep) => {
      acc[dep] = packageJson.peerDependencies[dep]
      return acc
    },
    {} as Record<PeerDependency, string>,
  )
}
