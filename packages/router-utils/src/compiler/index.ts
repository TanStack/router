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
  identify,
  isAssetId,
  isSplitGroupValue,
  langFromId,
  normalizePath,
  OWNED_QUERY_KEYS,
  pathOfId,
  planKeyString,
  resolveSameFileSpecifier,
  revision,
  SAME_FILE_SPECIFIER_RE,
  SCRIPT_ASSET_QUERY_RE,
  sameFileSpecifier,
} from './identity'
export type { PlanKey } from './identity'
export {
  forEachChild,
  isExpressionWrapper,
  parseModule,
  patternIdentifiers,
  unwrapExpression,
} from './source'
export type { ParseModuleOptions } from './source'
export { OutputBuilder, SourceText } from './output-builder'
export {
  DEST_INITIALIZER,
  SHAPE_ARROW,
  SHAPE_CALL,
  SHAPE_FUNCTION,
} from './expression'
export type { Dest, Shape } from './expression'
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
export { Declarations, VALUE } from './declarations'
export { derivedIdOf } from './rewrite'
export type { SymbolId } from './symbols'
export type { Range } from './header'
export type { RegionId, Unit } from './units'
export { ModuleAnalysis } from './analysis'
export { reassignedServerCode, writePosition } from './mutation'
export { contextOwner, walkMoved } from './moved'
export type { ContextKind, ContextUse, MovedWalk, Runs } from './moved'
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
  PlanEdges,
  PlanFacts,
} from './plan'
export { listEnd, removeListItems } from './removal/index'
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
  expireVirtual,
  fileModifiedAt,
  invalidate,
  isAnalyzableSpecifier,
  liveKey,
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
export {
  compileModule,
  createCompilerCaches,
  emptyModuleOutput,
  holdKey,
  settleModule,
} from './pipeline'
export type { Settlement } from './pipeline'
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
// compilations, emitted source maps); nothing of the
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
  rebuildModulesWhere,
  reportingFailure,
} from './hosts/rebuild'
export type { IdleCompilerLike, RebuildCompilationLike } from './hosts/rebuild'
export { emittedMapTexts } from './hosts/emitted-maps'
export type {
  EmittedMapsCompilerLike,
  RecordMapText,
} from './hosts/emitted-maps'
export { compilerCacheKey } from './hosts/compiler-version'
export {
  isRecordedDiagnostic,
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
