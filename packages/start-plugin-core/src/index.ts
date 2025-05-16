export type { CompileOptions, IdentifierConfig } from './compilers'

export { compileStartOutputFactory } from './compilers'

export type { PagesJson } from './nitro/build-sitemap'
export { buildSitemap } from './nitro/build-sitemap'

export {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
  pageSchema,
} from './schema'

export { TanStackStartVitePluginCore } from './plugin'
