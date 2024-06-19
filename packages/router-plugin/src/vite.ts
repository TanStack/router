import { unpluginRouterCodeSplitter } from './code-splitter'
import { unpluginRouterGenerator } from './router-generator'

import type { PluginOptions } from './config'
import type { VitePlugin } from 'unplugin'

export const TanStackRouterGeneratorVite = unpluginRouterGenerator.vite
export const TanStackRouterCodeSplitterVite = unpluginRouterCodeSplitter.vite

export function TanStackRouterVite(
  inlineConfig: Partial<PluginOptions>,
): Array<VitePlugin> {
  return [
    TanStackRouterGeneratorVite(inlineConfig) as VitePlugin,
    TanStackRouterCodeSplitterVite(inlineConfig) as VitePlugin,
  ]
}

export type Config = PluginOptions
