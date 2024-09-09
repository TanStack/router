import packageJson from '../../package.json'
import { PeerDependency } from '../types'

export function getDependenciesWithVersion(deps: Array<PeerDependency>) {
  return deps.reduce(
    (acc, dep) => {
      acc[dep] = packageJson.peerDependencies[dep]
      return acc
    },
    {} as Record<PeerDependency, string>,
  )
}
