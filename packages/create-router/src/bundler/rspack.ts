import { copyTemplateFiles } from '../utils/copyTemplateFiles'
import type { ApplyParams, BundlerResult, PeerDependency } from '../types'

export const scripts = {
  dev: 'rsbuild dev --port 3001',
  build: 'rsbuild build',
  preview: 'rsbuild preview',
} as const

export const devDependencies = [
  '@rsbuild/core',
  '@rsbuild/plugin-react',
] as const satisfies Array<PeerDependency>

export async function apply({
  targetFolder,
}: ApplyParams): Promise<BundlerResult> {
  await copyTemplateFiles({
    file: '**/*',
    sourceFolder: 'bundler/rspack',
    targetFolder,
  })
  return {
    scripts,
    devDependencies,
  }
}
