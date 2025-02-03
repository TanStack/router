export { TSR_DEFERRED_PROMISE, defer } from './defer'
export type { DeferredPromiseState, DeferredPromise } from './defer'
export { preloadWarning } from './link'
export type {
  IsRequiredParams,
  ParsePathParams,
  AddTrailingSlash,
  RemoveTrailingSlashes,
  AddLeadingSlash,
  RemoveLeadingSlashes,
  ActiveOptions,
  LinkOptionsProps,
  ResolveCurrentPath,
  ResolveParentPath,
  ResolveRelativePath,
  LinkCurrentTargetElement,
} from './link'

export type {
  StartSerializer,
  Serializable,
  SerializerParse,
  SerializerParseBy,
  SerializerStringify,
  SerializerStringifyBy,
} from './serializer'

export type { ParsedLocation } from './location'
export type { Manifest, RouterManagedTag } from './manifest'
export { isMatch } from './Matches'
export type {
  AnyMatchAndValue,
  FindValueByIndex,
  FindValueByKey,
  CreateMatchAndValue,
  NextMatchAndValue,
  IsMatchKeyOf,
  IsMatchPath,
  IsMatchResult,
  IsMatchParse,
  IsMatch,
} from './Matches'
export {
  joinPaths,
  cleanPath,
  trimPathLeft,
  trimPathRight,
  trimPath,
  removeTrailingSlash,
  exactPathTest,
  resolvePath,
  parsePathname,
  interpolatePath,
  matchPathname,
  removeBasepath,
  matchByPath,
} from './path'
export type { Segment } from './path'
export { encode, decode } from './qss'
export { rootRouteId } from './root'
export type { RootRouteId } from './root'

export type {
  AnyPathParams,
  SearchSchemaInput,
  AnyContext,
  RouteContext,
  PreloadableObj,
  RoutePathOptions,
  StaticDataRouteOption,
  RoutePathOptionsIntersection,
  SearchFilter,
  SearchMiddlewareContext,
  SearchMiddleware,
  ResolveId,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  InferAllParams,
  InferAllContext,
  MetaDescriptor,
  RouteLinkEntry,
  SearchValidator,
  AnySearchValidator,
  DefaultSearchValidator,
  ErrorRouteProps,
  ErrorComponentProps,
  NotFoundRouteProps,
  ParseSplatParams,
  SplatParams,
  ResolveParams,
  ParseParamsFn,
  StringifyParamsFn,
  ParamsOptions,
  UpdatableStaticRouteOption,
  LooseReturnType,
  LooseAsyncReturnType,
  ContextReturnType,
  ContextAsyncReturnType,
  ResolveRouteContext,
  ResolveLoaderData,
  RoutePrefix,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  ResolveSearchSchemaFnInput,
  ResolveSearchSchemaInput,
  ResolveSearchSchemaFn,
  ResolveSearchSchema,
} from './route'

export { defaultSerializeError, getLocationChangeInfo } from './router'
export type {
  ViewTransitionOptions,
  ExtractedBaseEntry,
  ExtractedStream,
  ExtractedPromise,
  ExtractedEntry,
  StreamState,
  TrailingSlashOption,
} from './router'

export type { MatchLocation, CommitLocationOptions } from './RouterProvider'

export { retainSearchParams, stripSearchParams } from './searchMiddleware'

export {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
} from './searchParams'
export type { SearchSerializer, SearchParser } from './searchParams'

export type { OptionalStructuralSharing } from './structuralSharing'

export {
  last,
  functionalUpdate,
  pick,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  escapeJSON,
  shallow,
  createControlledPromise,
} from './utils'
export type {
  NoInfer,
  IsAny,
  PickAsRequired,
  PickRequired,
  PickOptional,
  WithoutEmpty,
  Expand,
  DeepPartial,
  MakeDifferenceOptional,
  IsUnion,
  IsNonEmptyObject,
  Assign,
  IntersectAssign,
  Timeout,
  Updater,
  NonNullableUpdater,
  StringLiteral,
  ThrowOrOptional,
  ControlledPromise,
  ExtractObjects,
  PartialMergeAllObject,
  MergeAllPrimitive,
  ExtractPrimitives,
  PartialMergeAll,
  Constrain,
  ConstrainLiteral,
  UnionToIntersection,
  MergeAllObjects,
  MergeAll,
  ValidateJSON,
} from './utils'

export type {
  StandardSchemaValidatorProps,
  StandardSchemaValidator,
  AnyStandardSchemaValidator,
  StandardSchemaValidatorTypes,
  AnyStandardSchemaValidateSuccess,
  AnyStandardSchemaValidateFailure,
  AnyStandardSchemaValidateIssue,
  AnyStandardSchemaValidateInput,
  AnyStandardSchemaValidate,
  ValidatorObj,
  AnyValidatorObj,
  ValidatorAdapter,
  AnyValidatorAdapter,
  AnyValidatorFn,
  ValidatorFn,
  Validator,
  AnyValidator,
  AnySchema,
  DefaultValidator,
  ResolveSearchValidatorInputFn,
  ResolveSearchValidatorInput,
  ResolveValidatorInputFn,
  ResolveValidatorInput,
  ResolveValidatorOutputFn,
  ResolveValidatorOutput,
} from './validators'
