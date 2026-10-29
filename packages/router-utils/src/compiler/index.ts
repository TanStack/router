/**
 * `@tanstack/router-utils/compiler` — the shared compiler core on Yuku (see
 * README.md). Planners live in `@tanstack/router-plugin` and
 * `@tanstack/start-plugin-core`; hosts compose them through `compileModule`.
 * Not a public API: it exports what those packages use.
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
export * from './plan'
export * from './orphans'
export * from './emit'
export * from './values'
export * from './summary'
export * from './facts'
export * from './host'
export * from './pipeline'
export * from './stats'
// bundler-shaped helpers of the hosts
export * from './hosts/index'
/** Yuku's walker and node type, for planners (the core owns the yuku dependency). */
export { walk } from 'yuku'
export type { Node as YukuNode } from 'yuku'
