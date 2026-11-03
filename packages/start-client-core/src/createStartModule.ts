import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AssignAllServerFnContext,
  AssignAllServerRequestContext,
  GlobalFetchRequestContext,
} from './createMiddleware'
import type {
  AnyStartInstance,
  CreateStartOptions,
  StartInstanceOptions,
} from './createStart'
import type { StartOptionList } from './startOptionList'
import type {
  AnySerializationAdapter,
  Assign,
  SSROption,
} from '@tanstack/router-core'

/** Type-only requirements of route modules, keyed by their package names. */
export interface StartModuleRequirements {}

/** A module's middleware register, independent of its contributed fragment. */
export interface StartModuleRegister<TModuleId extends string> {
  startModule: TModuleId
}

export type StartModuleRequiredContext<
  TModuleId extends string,
  TKind extends 'requestContext' | 'functionContext',
> = [TModuleId] extends [never]
  ? undefined
  : TModuleId extends keyof StartModuleRequirements
    ? TKind extends keyof StartModuleRequirements[TModuleId]
      ? StartModuleRequirements[TModuleId][TKind]
      : undefined
    : undefined

export type StartModuleIdOf<TRegister> = TRegister extends {
  startModule: infer TModuleId extends string
}
  ? TModuleId
  : never

/** Executable contributions; required context is declared in the registry. */
export interface StartModuleOptions<
  in out TSerializationAdapters,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  serializationAdapters?: TSerializationAdapters
  requestMiddleware?: TRequestMiddlewares
  functionMiddleware?: TFunctionMiddlewares
}

export interface StartModule<
  in out TModuleId extends string,
  in out TSerializationAdapters,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  id: TModuleId
  getOptions: () => StartModuleOptions<
    TSerializationAdapters,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >
}

export type AnyStartModule = StartModule<any, any, any, any>

/** Application settings cannot be applied by an executable module fragment. */
type ApplicationOnlyOptions = {
  [K in Exclude<
    keyof CreateStartOptions<unknown, unknown, unknown, unknown, unknown>,
    StartModuleOptionKey
  >]?: never
}

export type CreateStartModuleFn<TModuleId extends string> = <
  const TSerializationAdapters extends ReadonlyArray<AnySerializationAdapter> =
    [],
  const TRequestMiddlewares extends ReadonlyArray<AnyRequestMiddleware> = [],
  const TFunctionMiddlewares extends ReadonlyArray<AnyFunctionMiddleware> = [],
  const TOptions extends {
    serializationAdapters?: ReadonlyArray<AnySerializationAdapter>
    requestMiddleware?: ReadonlyArray<AnyRequestMiddleware>
    functionMiddleware?: ReadonlyArray<AnyFunctionMiddleware>
  } = StartModuleOptions<
    TSerializationAdapters,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >,
>(
  getOptions: (() => StartModuleOptions<
    TSerializationAdapters,
    TRequestMiddlewares,
    TFunctionMiddlewares
  > &
    ApplicationOnlyOptions) &
    (() => TOptions),
) => StartModule<
  TModuleId,
  StartOptionList<TOptions, 'serializationAdapters', TSerializationAdapters>,
  StartOptionList<TOptions, 'requestMiddleware', TRequestMiddlewares>,
  StartOptionList<TOptions, 'functionMiddleware', TFunctionMiddlewares>
>

/** @experimental Bound by generated scopes to the module's package name. */
export function createStartModule<const TModuleId extends string>(
  moduleId: TModuleId,
): CreateStartModuleFn<TModuleId> {
  return ((getOptions) => ({
    id: moduleId,
    getOptions,
  })) as CreateStartModuleFn<TModuleId>
}

/** The contributions visible to a module's server functions and routes. */
export type StartModuleConfig<TModule extends AnyStartModule> =
  StartInstanceOptions<
    StartModuleOption<TModule, 'serializationAdapters'>,
    SSROption,
    StartModuleOption<TModule, 'requestMiddleware'>,
    StartModuleOption<TModule, 'functionMiddleware'>
  >

type StartModuleOptionKey =
  | 'serializationAdapters'
  | 'requestMiddleware'
  | 'functionMiddleware'

type StartModuleOption<TModule, TKey extends StartModuleOptionKey> =
  TModule extends StartModule<
    any,
    infer TSerializationAdapters,
    infer TRequestMiddlewares,
    infer TFunctionMiddlewares
  >
    ? {
        serializationAdapters: TSerializationAdapters
        requestMiddleware: TRequestMiddlewares
        functionMiddleware: TFunctionMiddlewares
      }[TKey]
    : []

type Entries<TList> = TList extends ReadonlyArray<infer TEntry> ? TEntry : never

type StartModulesEntries<
  TModules,
  TKey extends StartModuleOptionKey,
  TEntries extends Array<unknown> = [],
> = TModules extends readonly [infer TModule, ...infer TRest]
  ? StartModuleOption<TModule, TKey> extends infer TList extends
      ReadonlyArray<unknown>
    ? StartModulesEntries<TRest, TKey, [...TEntries, ...TList]>
    : TEntries
  : TModules extends readonly []
    ? TEntries
    : Array<
        TEntries[number] | Entries<StartModuleOption<Entries<TModules>, TKey>>
      >

export type WithStartModules<
  TOwn extends ReadonlyArray<unknown>,
  TModules,
  TKey extends StartModuleOptionKey,
> = TModules extends readonly []
  ? TOwn
  : [...TOwn, ...StartModulesEntries<TModules, TKey>]

type InstanceTypes<TInstance extends AnyStartInstance> = Awaited<
  ReturnType<TInstance['getOptions']>
>['~types']

type IsAny<T> = 0 extends 1 & T ? true : false

type ProvenModuleId<TModule, TId extends string> = [TModule] extends [
  AnyStartModule,
]
  ? IsAny<TModule['id']> extends true
    ? never
    : [TModule['id']] extends [TId]
      ? TId extends TModule['id']
        ? TId
        : never
      : never
  : never

type Installed<TModules, TId extends string> =
  IsAny<TModules> extends true
    ? 'Cannot establish route module installation from an unknown extends list'
    : TModules extends ReadonlyArray<AnyStartModule>
      ? number extends TModules['length']
        ? 'Cannot establish route module installation from a non-tuple extends list'
        : TId extends {
              [K in keyof TModules]: ProvenModuleId<TModules[K], TId>
            }[number]
          ? true
          : `Route module '${TId}' is not installed: add 'extends: startModules' to createStart()`
      : 'Cannot establish route module installation from an unknown extends list'

type HasContributions<TModule> =
  Entries<StartModuleOption<TModule, StartModuleOptionKey>> extends never
    ? false
    : true

type ValidateInstalled<TActual, TRequired> = TRequired extends readonly [
  infer TModule extends AnyStartModule,
  ...infer TRest,
]
  ? HasContributions<TModule> extends false
    ? ValidateInstalled<TActual, TRest>
    : Exclude<Installed<TActual, TModule['id']>, true> extends infer TError
      ? [TError] extends [never]
        ? ValidateInstalled<TActual, TRest>
        : TError
      : never
  : TRequired extends readonly []
    ? true
    : 'Cannot establish required fragments from a non-tuple module list'

type MissingKeys<THave, TNeed> = Exclude<keyof TNeed, keyof THave> & string

type IncompatibleKeys<THave, TNeed> = {
  [K in keyof TNeed]-?: K extends keyof THave
    ? [THave[K]] extends [TNeed[K]]
      ? never
      : K
    : never
}[keyof TNeed] &
  string

type ValidateContext<
  TId extends string,
  TPhase extends string,
  TProvided,
  TRequired,
  TWhere extends string = '',
> = [TRequired] extends [never]
  ? `Route module '${TId}' declares impossible ${TPhase} context${TWhere}`
  : [TRequired] extends [undefined]
    ? true
    : IsAny<TProvided> extends true
      ? `Cannot establish ${TPhase} context for route module '${TId}' from any${TWhere}`
      : [TProvided] extends [TRequired]
        ? true
        : [MissingKeys<TProvided, TRequired>] extends [never]
          ? [IncompatibleKeys<TProvided, TRequired>] extends [never]
            ? `Route module '${TId}' requires compatible ${TPhase} context${TWhere}`
            : `Route module '${TId}' requires ${TPhase} context with incompatible field '${IncompatibleKeys<TProvided, TRequired>}'${TWhere}`
          : `Route module '${TId}' requires ${TPhase} context '${MissingKeys<TProvided, TRequired>}' that is not provided${TWhere}`

type ValidateConsumer<
  TId extends string,
  TPhase extends 'request' | 'function',
  TContext,
  TWhere extends string = '',
> = [TId] extends [never]
  ? true
  : TId extends unknown
    ? ValidateContext<
        TId,
        'request',
        TContext,
        StartModuleRequiredContext<TId, 'requestContext'>,
        TWhere
      > extends infer TRequest
      ? [TRequest] extends [true]
        ? TPhase extends 'function'
          ? ValidateContext<
              TId,
              'function',
              TContext,
              StartModuleRequiredContext<TId, 'functionContext'>,
              TWhere
            >
          : true
        : TRequest
      : never
    : never

type RequiredContextKeys<T> = [T] extends [never]
  ? 'impossible'
  : [T] extends [undefined]
    ? never
    : T extends unknown
      ? keyof NonNullable<T>
      : never

type RequiredContextKeysFor<TId> = TId extends string
  ?
      | RequiredContextKeys<StartModuleRequiredContext<TId, 'requestContext'>>
      | RequiredContextKeys<StartModuleRequiredContext<TId, 'functionContext'>>
  : never

type ConsumerIds<TId> = TId extends string
  ?
      | RequiredContextKeys<StartModuleRequiredContext<TId, 'requestContext'>>
      | RequiredContextKeys<
          StartModuleRequiredContext<TId, 'functionContext'>
        > extends never
    ? never
    : TId
  : never

type MiddlewareWork<TMiddleware, TId extends string, TExpanded = false> = {
  middleware: TMiddleware
  moduleId: TId
  expanded: TExpanded
}

type TagList<TList, TId extends string> =
  IsAny<TList> extends true
    ? Array<MiddlewareWork<unknown, TId>>
    : TList extends undefined
      ? []
      : TList extends ReadonlyArray<unknown>
        ? { [K in keyof TList]: MiddlewareWork<TList[K], TId> }
        : Array<MiddlewareWork<unknown, TId>>

type TaggedContributions<
  TModules,
  TKey extends 'requestMiddleware' | 'functionMiddleware',
  TEntries extends ReadonlyArray<MiddlewareWork<unknown, string>> = [],
> = TModules extends readonly [
  infer TModule extends AnyStartModule,
  ...infer TRest,
]
  ? TagList<
      StartModuleOption<TModule, TKey>,
      TModule['id']
    > extends infer TTagged extends ReadonlyArray<
      MiddlewareWork<unknown, string>
    >
    ? TaggedContributions<TRest, TKey, [...TEntries, ...TTagged]>
    : never
  : TModules extends readonly []
    ? TEntries
    : Array<MiddlewareWork<unknown, string>>

type MiddlewareTypes<T> = T extends { '~types': infer TTypes } ? TTypes : never

type MiddlewareOwner<T, TFallback extends string> =
  MiddlewareTypes<T> extends {
    startModule: infer TId extends string
  }
    ? [TId] extends [never]
      ? TFallback
      : TId
    : TFallback

type NestedMiddleware<T> =
  MiddlewareTypes<T> extends { middlewares: infer TList } ? TList : undefined

type ContextState<
  TContext = unknown,
  TSeen = unknown,
  TWriter extends string = string,
> = {
  context: TContext
  seen: TSeen
  writer: TWriter
}

type ContextPropertyKey<TKey extends PropertyKey> = TKey extends number
  ? number extends TKey
    ? `${number}` | 'NaN' | 'Infinity' | '-Infinity'
    : `${TKey}`
  : TKey

/** Index signatures also include template patterns such as `${number}`. */
type HasContextIndex<TKeys extends PropertyKey> = true extends (
  TKeys extends PropertyKey
    ? {} extends Record<TKeys, unknown>
      ? true
      : false
    : never
)
  ? true
  : false

type OverlappingContextValues<
  TContext,
  TKey extends PropertyKey,
> = TContext[keyof TContext &
  keyof {
    [K in keyof TContext as [
      ContextPropertyKey<K> & ContextPropertyKey<TKey>,
    ] extends [never]
      ? never
      : K]: unknown
  }]

type GuaranteedContextProperties<TContext> = {
  [K in keyof TContext as {} extends Pick<TContext, K> ? never : K]: TContext[K]
}

type HasOptionalContextProperties<TContext> =
  keyof TContext extends keyof GuaranteedContextProperties<TContext>
    ? false
    : true

type WidenOptionalContext<TContext, TOther> = {
  [K in keyof TContext]: {} extends Pick<TContext, K>
    ? TContext[K] | OverlappingContextValues<TOther, K>
    : TContext[K]
}

type RetainedContext<TLeft, TRight> = {
  [K in keyof TLeft as ContextPropertyKey<K> extends ContextPropertyKey<
    keyof GuaranteedContextProperties<TRight>
  >
    ? never
    : K]: TLeft[K] | OverlappingContextValues<TRight, K>
}

/**
 * Runtime context merges use JavaScript property identity. Numeric and string
 * spellings must overwrite, not intersect into a misleading `never` value.
 * Optional fields and index signatures may leave old keys present. Retain the
 * left-hand presence and both possible values unless the right guarantees a key.
 * This proof can conservatively retain a widened index after a finite repair.
 */
type AssignRequiredContext<TLeft, TRight> =
  IsAny<TLeft | TRight> extends true
    ? Assign<TLeft, TRight>
    : TLeft extends object
      ? TRight extends object
        ? true extends
            | HasOptionalContextProperties<TLeft>
            | HasOptionalContextProperties<TRight>
          ? RetainedContext<TLeft, TRight> & WidenOptionalContext<TRight, TLeft>
          : Extract<keyof TLeft | keyof TRight, number> extends never
            ? Assign<TLeft, TRight>
            : RetainedContext<TLeft, TRight> & TRight
        : Assign<TLeft, TRight>
      : Assign<TLeft, TRight>

/**
 * This walk proves required context; callback inference retains the full context
 * separately. Keep correlated union branches and complete required field values,
 * but avoid enumerating execute/skip combinations for unrelated fields.
 * Indexed objects stay whole: projecting their keys can invent a required named
 * property, or discard a property that violates an indexed requirement.
 */
type RequiredContext<TContext, TKeys extends PropertyKey> =
  HasContextIndex<TKeys> extends true
    ? TContext
    : IsAny<TContext> extends true
      ? TContext
      : TContext extends object
        ? HasContextIndex<keyof TContext> extends true
          ? TContext
          : {
              [K in keyof TContext as ContextPropertyKey<K> extends ContextPropertyKey<TKeys>
                ? K
                : never]: TContext[K]
            }
        : TContext

type Advance<
  TState extends ContextState,
  TMiddleware,
  TId extends string,
  TKeys extends PropertyKey,
> =
  MiddlewareTypes<TMiddleware> extends { serverContext: infer TOutput }
    ? RequiredContext<TOutput, TKeys> extends infer TRequiredOutput
      ? ContextState<
          // Type equality cannot prove object identity. A structurally matching
          // earlier middleware may be this same object, so both outcomes matter.
          unknown extends TState['seen']
            ?
                | TState['context']
                | AssignRequiredContext<TState['context'], TRequiredOutput>
            : [Extract<TState['seen'], TMiddleware>] extends [never]
              ? AssignRequiredContext<TState['context'], TRequiredOutput>
              :
                  | TState['context']
                  | AssignRequiredContext<TState['context'], TRequiredOutput>,
          TState['seen'] | TMiddleware,
          [TOutput] extends [undefined] ? TState['writer'] : TId
        >
      : never
    : 'Cannot establish the context produced by a middleware'

/** Tail-recursive work queue follows nested dependencies before their consumer. */
type Walk<
  TQueue,
  TState extends ContextState,
  TPhase extends 'request' | 'function',
  TKeys extends PropertyKey,
> = TQueue extends readonly [
  infer THead extends MiddlewareWork<unknown, string, boolean>,
  ...infer TRest,
]
  ? MiddlewareOwner<
      THead['middleware'],
      THead['moduleId']
    > extends infer TOwner extends string
    ? THead['expanded'] extends true
      ? MiddlewareTypes<THead['middleware']> extends { method: unknown }
        ? // Server-function builders only contribute their middleware lists.
          Walk<TRest, TState, TPhase, TKeys>
        : ValidateConsumer<
              TOwner,
              TPhase,
              TState['context'],
              ` before middleware from '${TOwner}' (after '${TState['writer']}')`
            > extends infer TCheck
          ? [TCheck] extends [true]
            ? Advance<
                TState,
                THead['middleware'],
                TOwner,
                TKeys
              > extends infer TNext
              ? TNext extends ContextState
                ? Walk<TRest, TNext, TPhase, TKeys>
                : TNext
              : never
            : TCheck
          : never
      : Walk<
          [
            ...TagList<NestedMiddleware<THead['middleware']>, TOwner>,
            MiddlewareWork<THead['middleware'], TOwner, true>,
            ...TRest,
          ],
          TState,
          TPhase,
          TKeys
        >
    : never
  : TQueue extends readonly []
    ? TState
    : `Cannot establish ${TPhase} context from a non-tuple middleware list`

type RegisteredMiddleware<
  TRegister,
  TKey extends 'requestMiddleware' | 'functionMiddleware',
> = TRegister extends { config: { '~types': infer TTypes } }
  ? TTypes[keyof TTypes & TKey]
  : undefined

/** Include nested global entries when deciding whether a local entry may skip. */
type KnownMiddleware<TQueue, TSeen = never> = TQueue extends readonly [
  infer THead,
  ...infer TRest,
]
  ? NestedMiddleware<THead> extends infer TNested
    ? TNested extends ReadonlyArray<unknown>
      ? KnownMiddleware<[...TNested, ...TRest], TSeen | THead>
      : KnownMiddleware<TRest, TSeen | THead>
    : never
  : TQueue extends undefined | readonly []
    ? TSeen
    : unknown

type LocalContextState<
  TRegister,
  TPhase extends 'request' | 'function',
  TKeys extends PropertyKey,
> = ContextState<
  RequiredContext<
    TPhase extends 'request'
      ? AssignAllServerRequestContext<TRegister, undefined>
      : AssignAllServerFnContext<TRegister, undefined>,
    TKeys
  >,
  | KnownMiddleware<RegisteredMiddleware<TRegister, 'requestMiddleware'>>
  | (TPhase extends 'function'
      ? KnownMiddleware<RegisteredMiddleware<TRegister, 'functionMiddleware'>>
      : never),
  'global middleware'
>

/** Owners anywhere in a local chain, including widened lists and dependencies. */
type LocalMiddlewareOwners<TList> =
  TList extends ReadonlyArray<infer TMiddleware>
    ? IsAny<TMiddleware> extends true
      ? never
      : TMiddleware extends unknown
        ?
            | MiddlewareOwner<TMiddleware, never>
            | LocalMiddlewareOwners<NestedMiddleware<TMiddleware>>
        : never
    : never

/** Check a completed local chain only when attaching its server-side consumer. */
export type ValidateModuleMiddlewareConsumer<
  TRegister,
  TMiddlewares,
  TPhase extends 'request' | 'function',
> = [
  ConsumerIds<StartModuleIdOf<TRegister> | LocalMiddlewareOwners<TMiddlewares>>,
] extends [never]
  ? unknown
  : Walk<
        TagList<TMiddlewares, 'local middleware'>,
        LocalContextState<
          TRegister,
          TPhase,
          RequiredContextKeysFor<
            StartModuleIdOf<TRegister> | LocalMiddlewareOwners<TMiddlewares>
          >
        >,
        TPhase,
        RequiredContextKeysFor<
          StartModuleIdOf<TRegister> | LocalMiddlewareOwners<TMiddlewares>
        >
      > extends infer TResult
    ? [TResult] extends [ContextState]
      ? ValidateConsumer<
          StartModuleIdOf<TRegister>,
          TPhase,
          TResult['context'],
          ' before the local server callback'
        > extends infer TCheck
        ? [TCheck] extends [true]
          ? unknown
          : TCheck
        : never
      : TResult
    : never

type ValidateConsumers<
  TIds,
  TRequestContext,
  TFunctionContext,
  TWhere extends string,
> = TIds extends readonly [infer TId extends string, ...infer TRest]
  ? ValidateHostConsumer<
      TId,
      TRequestContext,
      TFunctionContext,
      TWhere
    > extends infer TResult
    ? [TResult] extends [true]
      ? ValidateConsumers<TRest, TRequestContext, TFunctionContext, TWhere>
      : TResult
    : never
  : true

type ValidateHostConsumer<
  TId extends string,
  TRequestContext,
  TFunctionContext,
  TWhere extends string,
> = TId extends unknown
  ? ValidateContext<
      TId,
      'request',
      TRequestContext,
      StartModuleRequiredContext<TId, 'requestContext'>,
      TWhere
    > extends infer TRequest
    ? [TRequest] extends [true]
      ? ValidateConsumer<
          TId,
          'function',
          TFunctionContext,
          TWhere
        > extends infer TFunction
        ? [TFunction] extends [true]
          ? true
          : TFunction
        : never
      : TRequest
    : never
  : never

type ValidateEffectiveContext<
  TTypes,
  TIds extends ReadonlyArray<string>,
  TKeys extends PropertyKey = RequiredContextKeysFor<
    TIds[number] | ExecutedMiddlewareOwners<TTypes>
  >,
> =
  Walk<
    TagList<TTypes[keyof TTypes & 'ownRequestMiddleware'], 'application'>,
    ContextState<
      RequiredContext<GlobalFetchRequestContext, TKeys>,
      never,
      'handler.fetch'
    >,
    'request',
    TKeys
  > extends infer TOwnRequest
    ? [TOwnRequest] extends [ContextState]
      ? Walk<
          TagList<
            TTypes[keyof TTypes & 'ownFunctionMiddleware'],
            'application'
          >,
          TOwnRequest,
          'function',
          TKeys
        > extends infer TOwnFunction
        ? [TOwnFunction] extends [ContextState]
          ? ValidateConsumers<
              TIds,
              TOwnRequest['context'],
              TOwnFunction['context'],
              ' from application middleware'
            > extends infer THost
            ? [THost] extends [true]
              ? Walk<
                  TaggedContributions<
                    TTypes[keyof TTypes & 'startModules'],
                    'requestMiddleware'
                  >,
                  TOwnRequest,
                  'request',
                  TKeys
                > extends infer TRequest
                ? [TRequest] extends [ContextState]
                  ? Walk<
                      [
                        ...TagList<
                          TTypes[keyof TTypes & 'ownFunctionMiddleware'],
                          'application'
                        >,
                        ...TaggedContributions<
                          TTypes[keyof TTypes & 'startModules'],
                          'functionMiddleware'
                        >,
                      ],
                      TRequest,
                      'function',
                      TKeys
                    > extends infer TFunction
                    ? [TFunction] extends [ContextState]
                      ? ValidateConsumers<
                          TIds,
                          TRequest['context'],
                          TFunction['context'],
                          ' at terminal consumers'
                        >
                      : TFunction
                    : never
                  : TRequest
                : never
              : THost
            : never
          : TOwnFunction
        : never
      : TOwnRequest
    : never

/** Owners of executable entries, whether or not their routes are installed. */
type ExecutedMiddlewareOwners<TTypes> =
  | LocalMiddlewareOwners<
      TTypes[keyof TTypes & ('requestMiddleware' | 'functionMiddleware')]
    >
  | (Entries<
      TTypes[keyof TTypes & 'startModules']
    > extends infer TModule extends AnyStartModule
      ? TModule['id']
      : never)

/**
 * Generated contracts supply installed package IDs separately from executable
 * fragments, so requirement-only modules need no runtime witness.
 */
export type ValidateStartModules<
  TInstance extends AnyStartInstance,
  TModules extends ReadonlyArray<AnyStartModule>,
  TInstalledModuleIds extends ReadonlyArray<string> = {
    [K in keyof TModules]: TModules[K]['id']
  },
> =
  ValidateInstalled<
    InstanceTypes<TInstance>['startModules'],
    TModules
  > extends infer TInstalled
    ? [TInstalled] extends [true]
      ? number extends TInstalledModuleIds['length']
        ? 'Cannot establish installed route modules from a non-tuple contract list'
        : string extends TInstalledModuleIds[number]
          ? 'Cannot establish installed route module requirements from unknown package identities'
          : [
                ConsumerIds<
                  | TInstalledModuleIds[number]
                  | ExecutedMiddlewareOwners<InstanceTypes<TInstance>>
                >,
              ] extends [never]
            ? true
            : ValidateEffectiveContext<
                InstanceTypes<TInstance>,
                TInstalledModuleIds
              >
      : TInstalled
    : never

export type AssertStartModules<TResult extends true> = TResult
