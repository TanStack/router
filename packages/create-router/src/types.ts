import type packageJson from '../package.json'

export interface ApplyParams {
  targetFolder: string
}

export type PeerDependency = keyof typeof packageJson.peerDependencies

export interface BundlerResult {
  scripts: Record<string, string>
  devDependencies: Array<PeerDependency>
  dependencies?: Array<PeerDependency>
  overrides?: Partial<Record<string, Partial<Record<string, string>>>>
}
