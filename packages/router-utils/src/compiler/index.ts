/**
 * `@tanstack/router-utils/compiler` — the shared compiler core on Yuku (see
 * README.md). Planners live in `@tanstack/router-plugin` and
 * `@tanstack/start-plugin-core`; hosts compose them through `compileModule`.
 * Not a public API: an internal subpath for those packages, without semver.
 * It exports what the planners and hosts (and their tests) import, plus
 * `PlannerData` and `PlannerServices` (the interfaces planner packages
 * augment); the core's own helpers stay internal, and the core's tests
 * import those from their files.
 */
export {
  ASSET_QUERY_RE,
  canonicalJson,
  deriveId,
  digestOf,
  EXTRACTED_EXPORT_QUERY_RE,
  identify,
  isAssetId,
  isSplitGroupValue,
  langFromId,
  normalizePath,
  OWNED_QUERY_KEYS,
  planKeyString,
  resolveSameFileSpecifier,
  revision,
  SAME_FILE_SPECIFIER_RE,
  SCRIPT_ASSET_QUERY_RE,
  sameFileSpecifier,
} from './identity'
export type { PlanKey } from './identity'
export {
  isExpressionWrapper,
  opensNonExpressionStatement,
  parseModule,
  patternIdentifiers,
  unwrapExpression,
} from './source'
export { OutputBuilder, SourceText } from './output-builder'
export {
  identifierBase,
  isValidIdentifier,
  ownEntry,
  stringLiteral,
} from './strings'
export {
  displayPath,
  reportCompileDiagnostics,
  WarningLedger,
} from './diagnostics'
export type {
  Diagnostic,
  DiagnosticPosition,
  DiagnosticSink,
} from './diagnostics'
export { valueBinding } from './symbols'
export { derivedIdOf } from './rewrite'
export type { SymbolId } from './symbols'
export type { Range } from './header'
export { isPureExpression } from './purity'
export type { RegionId, Unit } from './units'
export { ModuleAnalysis } from './analysis'
export type { ClassifiedRef, ImportEntry, Tier1 } from './analysis'
export type {
  Anchor,
  EditScope,
  Frag,
  GenFrag,
  GenUnitId,
  GlueImport,
  OutputId,
  PlaceFrag,
  PlannerRewrites,
  RefTarget,
  SymRef,
  TextFrag,
} from './rewrite'
export type {
  EdgeRecord,
  EmitPlan,
  EnvInfo,
  PlanContext,
  PlanFacts,
} from './plan'
export { listEnd, removeListItems } from './orphans'
export {
  applyCall,
  applyMember,
  EMPTY_RECOGNIZER,
  isKnownSpecifier,
  joinValues,
  recognizeImport,
  stampSites,
  staticPropertyKey,
  UNKNOWN,
  ValueAnalysis,
} from './values'
export type { AbstractValue, RecognizerTable } from './values'
export { LookupPath } from './resolve'
export { buildSummary } from './summary'
export { isVirtualId, RawFactsCache } from './facts'
export type { PersistedPlan, StaleSets } from './cache'
export {
  fileModifiedAt,
  invalidate,
  isAnalyzableSpecifier,
  OWNED_QUERY_RE,
  planDependencyFiles,
  releaseEnvironment,
  restorePlans,
} from './host'
export type {
  CompileConfig,
  CompileInput,
  CompileOutput,
  CompilerCaches,
  HostServices,
  InputSourceMap,
  InvalidateChange,
  Planner,
  PlannerData,
  PlannerServices,
  PolicyContext,
  PrefetchContext,
  RouteRegistry,
} from './host'
export { compileModule, createCompilerCaches } from './pipeline'
export type { ServerOnlyText } from './server-code'
export { invariantDiagnostic, invariantViolated } from './self-checks'
export type { InvariantViolation } from './self-checks'
export {
  cacheDisabled,
  collectionSizes,
  compilerStats,
  registerCompilerStats,
} from './stats'

// bundler-shaped helpers of the hosts (Vite builds, webpack-family loaders and
// compilations, eager extracted exports, emitted source maps); nothing of the
// compiler model uses them
export {
  isFinalBuild,
  reloadStaleModules,
  staleHotUpdate,
  takeStaleModules,
  loadDerivedSource,
  viteLog,
  watchLoadedFile,
  ViteRunSessions,
  watchDependencies,
  withOwnSourcesNamedByFile,
} from './hosts/vite'
export type { ModuleGraphLike } from './hosts/vite'
export { composeLoaderMap, loaderText, webpackResourceId } from './hosts/loader'
export {
  RSPACK_REBUILD_CALLBACKS_FIXED_IN,
  StaleSetDrain,
  pathsOf,
  rebuildModules,
  reportingFailure,
  rspackCallsEveryRebuildCallback,
} from './hosts/rebuild'
export type { IdleCompilerLike, RebuildCompilationLike } from './hosts/rebuild'
export {
  initialChunkResources,
  rollupEntryModuleIds,
  warnEagerExports,
  webpackImporters,
} from './hosts/eager-exports'
export type { InitialChunksLike } from './hosts/eager-exports'
export { emittedMapTexts } from './hosts/emitted-maps'
export type {
  EmittedMapsCompilerLike,
  RecordMapText,
} from './hosts/emitted-maps'
export { compilerCacheKey } from './hosts/compiler-version'
export {
  locatedDiagnostic,
  locatedError,
  locateDiagnostics,
} from './hosts/located-diagnostics'
export type {
  LocatedDiagnostic,
  LocatedDiagnosticsOptions,
} from './hosts/located-diagnostics'
/** Yuku's walker and node type, for planners (the core owns the yuku dependency). */
export { walk } from 'yuku'
export type { Node as YukuNode } from 'yuku'
