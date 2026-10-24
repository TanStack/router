/**
 * `@tanstack/router-utils/compiler` — the shared compiler core on Yuku
 * (DESIGN §1.2). Planners live in `@tanstack/router-plugin` and
 * `@tanstack/start-plugin-core`; hosts compose them through `compileModule`.
 */
export * from './identity'
export * from './source'
export { OutputBuilder, SourceText } from './output-builder'
export type {
  BuilderEdit,
  BuilderEditPart,
  OutputBuilderOptions,
  RawSourceMap,
} from './output-builder'
export * from './strings'
export * from './diagnostics'
export * from './symbols'
export * from './header'
export * from './purity'
export * from './units'
export * from './analysis'
export * from './rewrite'
export * from './names'
export * from './reach'
export * from './plan'
export * from './emit'
export * from './values'
export * from './summary'
export * from './resolve'
export * from './facts'
export * from './cache'
export * from './host'
export * from './pipeline'
