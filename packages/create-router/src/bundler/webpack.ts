import { copyTemplateFiles } from '../utils/copyTemplateFiles'
import type { ApplyParams, BundlerResult, PeerDependency } from '../types'

export const scripts = {
  dev: 'webpack serve --port 3001 --no-open',
  build: 'webpack build',
} as const

export const devDependencies = [
  '@swc/core',
  'html-webpack-plugin',
  'swc-loader',
  'webpack',
  'webpack-cli',
  'webpack-dev-server',
] as const satisfies Array<PeerDependency>

export async function apply({
  targetFolder,
}: ApplyParams): Promise<BundlerResult> {
  await copyTemplateFiles({
    file: '**/*',
    sourceFolder: 'bundler/webpack',
    targetFolder,
  })
  return {
    scripts,
    devDependencies,
  }
}
