export type { CompileOptions, IdentifierConfig } from './compilers'

export { compileStartOutputFactory } from './compilers'
export { Queue } from './queue'
export { buildNitroEnvironment } from './nitro/build-nitro'

export type { PagesJson } from './nitro/build-sitemap'
export { buildSitemap } from './nitro/build-sitemap'

export {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
  pageSchema,
} from './schema'
export type { Page } from './schema'


export { __internal_devHtmlUtils } from './dev-html'
export type { ExtractedHtmlTagInfo } from './dev-html'

declare global {
  // eslint-disable-next-line no-var
  var TSS_INJECTED_HEAD_SCRIPTS: string | undefined
}
