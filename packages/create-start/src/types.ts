import type packageJson from '../package.json'

export type PeerDependency = keyof typeof packageJson.peerDependencies
