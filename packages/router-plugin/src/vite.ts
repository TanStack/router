import { unpluginRouter } from './combined'
import { unpluginRouterCodeSplitter } from './code-splitter'
import { unpluginRouterGenerator } from './router-generator'

export const TanStackRouterVite = unpluginRouter.vite
export const TanStackRouterGeneratorVite = unpluginRouterGenerator.vite
export const TanStackRouterCodeSplitterVite = unpluginRouterCodeSplitter.vite
