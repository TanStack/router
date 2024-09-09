import { resolve } from 'node:path'
import type { PeerDependency } from '../types'
import { packageJson } from './packageJson'

export function getDependenciesWithVersion(deps: Array<PeerDependency>) {
  return deps.reduce(
    (acc, dep) => {
      acc[dep] = packageJson.peerDependencies[dep]
      return acc
    },
    {} as Record<PeerDependency, string>,
  )
}
