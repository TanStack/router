import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createStart } from '../createStart'
import { createStartModule } from '../createStartModule'
import type {
  AssertStartModules,
  ValidateStartModules,
} from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/optional-request-provider': { requestContext: { userId: string } }
    '@review/optional-function-provider': {
      functionContext: { permission: string }
    }
  }
}

const user = createMiddleware().server(({ next }) =>
  next({ context: { userId: 'user' } }),
)
const permission = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { permission: 'read' } }),
)
const audit = createMiddleware().server(({ next }) => next())
const functionAudit = createMiddleware({ type: 'function' }).server(
  ({ next }) => next(),
)
const required = createStartModule('@review/optional-fragment')(() => ({
  requestMiddleware: [audit],
}))
const firstExtra = createStartModule('@review/optional-first-extra')(() => ({
  requestMiddleware: [audit],
}))
const secondExtra = createStartModule('@review/optional-second-extra')(() => ({
  requestMiddleware: [audit],
}))
const enabled: boolean = Math.random() > 0.5

test('an explicitly undefined extends value cannot prove fragment installation', () => {
  const conditional = createStart(() => ({
    extends: enabled ? ([required] as const) : undefined,
  }))
  type Conditional = ValidateStartModules<typeof conditional, [typeof required]>
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch does not install the executable fragment
  type _Conditional = AssertStartModules<Conditional>
  const installed = createStart(() => ({ extends: [required] }))
  expectTypeOf<
    ValidateStartModules<typeof installed, [typeof required]>
  >().toEqualTypeOf<true>()
})

test('an explicitly undefined request middleware value cannot prove required context', () => {
  const conditional = createStart(() => ({
    requestMiddleware: enabled ? ([user] as const) : undefined,
  }))
  type Conditional = ValidateStartModules<
    typeof conditional,
    [],
    ['@review/optional-request-provider']
  >
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch has no request context provider
  type _Conditional = AssertStartModules<Conditional>
  const supplied = createStart(() => ({ requestMiddleware: [user] }))
  expectTypeOf<
    ValidateStartModules<
      typeof supplied,
      [],
      ['@review/optional-request-provider']
    >
  >().toEqualTypeOf<true>()
})

test('an explicitly undefined function middleware value cannot prove required context', () => {
  const conditional = createStart(() => ({
    functionMiddleware: enabled ? ([permission] as const) : undefined,
  }))
  type Conditional = ValidateStartModules<
    typeof conditional,
    [],
    ['@review/optional-function-provider']
  >
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch has no function context provider
  type _Conditional = AssertStartModules<Conditional>
  const supplied = createStart(() => ({ functionMiddleware: [permission] }))
  expectTypeOf<
    ValidateStartModules<
      typeof supplied,
      [],
      ['@review/optional-function-provider']
    >
  >().toEqualTypeOf<true>()
})

test('a factory branch that omits extends cannot prove fragment installation', () => {
  const conditional = createStart(() =>
    enabled ? { extends: [required] as const } : {},
  )
  type Conditional = ValidateStartModules<typeof conditional, [typeof required]>
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch does not install the executable fragment
  type _Conditional = AssertStartModules<Conditional>
  const spread = createStart(() => ({
    ...(enabled ? { extends: [required] as const } : {}),
  }))
  type Spread = ValidateStartModules<typeof spread, [typeof required]>
  expectTypeOf<Spread>().not.toEqualTypeOf<true>()
  // @ts-expect-error an optional property is not proof of installation
  type _Spread = AssertStartModules<Spread>
})

test('asynchronous factories preserve both required and conditional options', () => {
  const conditional = createStart(async () =>
    enabled ? { extends: [required] as const } : {},
  )
  type Conditional = ValidateStartModules<typeof conditional, [typeof required]>
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error awaiting options does not guarantee their extends property
  type _Conditional = AssertStartModules<Conditional>
  const optionalProvider = createStart(async () => ({
    ...(enabled ? { requestMiddleware: [user] as const } : {}),
  }))
  type OptionalProvider = ValidateStartModules<
    typeof optionalProvider,
    [],
    ['@review/optional-request-provider']
  >
  expectTypeOf<OptionalProvider>().not.toEqualTypeOf<true>()
  // @ts-expect-error awaiting options does not guarantee their request provider
  type _OptionalProvider = AssertStartModules<OptionalProvider>
  const fixed = createStart(async () => ({
    extends: [required],
    requestMiddleware: [user],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof fixed,
      [typeof required],
      ['@review/optional-request-provider']
    >
  >().toEqualTypeOf<true>()
})

test('explicit list generics do not prove options whose return shape was erased', () => {
  const conditional = createStart<[], true, [], [], [typeof required]>(() =>
    enabled ? { extends: [required] } : {},
  )
  type Conditional = ValidateStartModules<typeof conditional, [typeof required]>
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the callback may omit the explicitly typed extends list
  type _Conditional = AssertStartModules<Conditional>
})

test('fixed required siblings and required fragments present in every branch remain valid', () => {
  const fixedSibling = createStart(() => ({
    extends: [required, enabled ? firstExtra : secondExtra],
  }))
  expectTypeOf<
    ValidateStartModules<typeof fixedSibling, [typeof required]>
  >().toEqualTypeOf<true>()
  const modules:
    | readonly [typeof required, typeof firstExtra]
    | readonly [typeof required, typeof secondExtra] = enabled
    ? [required, firstExtra]
    : [required, secondExtra]
  const bothBranches = createStart(() => ({ extends: modules }))
  expectTypeOf<
    ValidateStartModules<typeof bothBranches, [typeof required]>
  >().toEqualTypeOf<true>()
})

test('conditionally omitted application request middleware cannot prove required context', () => {
  const conditional = createStart(() =>
    enabled ? { requestMiddleware: [user] as const } : {},
  )
  type Conditional = ValidateStartModules<
    typeof conditional,
    [],
    ['@review/optional-request-provider']
  >
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch has no request context provider
  type _Conditional = AssertStartModules<Conditional>
  const spread = createStart(() => ({
    ...(enabled ? { requestMiddleware: [user] as const } : {}),
  }))
  type Spread = ValidateStartModules<
    typeof spread,
    [],
    ['@review/optional-request-provider']
  >
  expectTypeOf<Spread>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional requestMiddleware field may be absent
  type _Spread = AssertStartModules<Spread>
  const providers:
    | readonly [typeof user]
    | readonly [typeof user, typeof audit] = enabled ? [user] : [user, audit]
  const fixed = createStart(() => ({ requestMiddleware: providers }))
  expectTypeOf<
    ValidateStartModules<
      typeof fixed,
      [],
      ['@review/optional-request-provider']
    >
  >().toEqualTypeOf<true>()
})

test('conditionally omitted application function middleware cannot prove required context', () => {
  const conditional = createStart(() =>
    enabled ? { functionMiddleware: [permission] as const } : {},
  )
  type Conditional = ValidateStartModules<
    typeof conditional,
    [],
    ['@review/optional-function-provider']
  >
  expectTypeOf<Conditional>().not.toEqualTypeOf<true>()
  // @ts-expect-error the false branch has no function context provider
  type _Conditional = AssertStartModules<Conditional>
  const spread = createStart(() => ({
    ...(enabled ? { functionMiddleware: [permission] as const } : {}),
  }))
  type Spread = ValidateStartModules<
    typeof spread,
    [],
    ['@review/optional-function-provider']
  >
  expectTypeOf<Spread>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional functionMiddleware field may be absent
  type _Spread = AssertStartModules<Spread>
  const providers:
    | readonly [typeof permission]
    | readonly [typeof permission, typeof functionAudit] = enabled
    ? [permission]
    : [permission, functionAudit]
  const fixed = createStart(() => ({ functionMiddleware: providers }))
  expectTypeOf<
    ValidateStartModules<
      typeof fixed,
      [],
      ['@review/optional-function-provider']
    >
  >().toEqualTypeOf<true>()
})

test('alternating request and function providers need a common provable context source', () => {
  const requestPermission = createMiddleware().server(({ next }) =>
    next({ context: { permission: 'read' } }),
  )
  const alternating = createStart(() =>
    enabled
      ? { requestMiddleware: [requestPermission] as const }
      : { functionMiddleware: [permission] as const },
  )
  type Alternating = ValidateStartModules<
    typeof alternating,
    [],
    ['@review/optional-function-provider']
  >
  // Both runtime branches provide permission before a server function runs.
  // The contract conservatively checks these two optional lists independently;
  // it cannot prove the relationship between their presence in this factory.
  expectTypeOf<Alternating>().not.toEqualTypeOf<true>()
  // @ts-expect-error correlated providers do not establish this global contract
  type _Alternating = AssertStartModules<Alternating>
  const common = createStart(() => ({ requestMiddleware: [requestPermission] }))
  expectTypeOf<
    ValidateStartModules<
      typeof common,
      [],
      ['@review/optional-function-provider']
    >
  >().toEqualTypeOf<true>()
})

test('optional fragment contributions cannot prove a later restoration always executes', () => {
  const overwrite = createMiddleware().server(({ next }) =>
    next({ context: { userId: 1 } }),
  )
  const restoreUser = createMiddleware().server(({ next }) =>
    next({ context: { userId: 'restored', restored: true } }),
  )
  const destroy = createStartModule('@review/optional-destroy')(() => ({
    requestMiddleware: [overwrite],
  }))
  const restore = createStartModule('@review/optional-restore')(() =>
    enabled ? { requestMiddleware: [restoreUser] as const } : {},
  )
  const start = createStart(() => ({
    requestMiddleware: [user],
    extends: [destroy, restore],
  }))
  type Result = ValidateStartModules<
    typeof start,
    [typeof destroy, typeof restore],
    ['@review/optional-request-provider']
  >
  expectTypeOf<Result>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional restoration leaves a numeric context on one runtime path
  type _Result = AssertStartModules<Result>
})

test('optional fragment function middleware cannot prove a later restoration always executes', () => {
  const overwrite = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { permission: 1 } }),
  )
  const restorePermission = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { permission: 'restored', restored: true } }),
  )
  const destroy = createStartModule('@review/optional-function-destroy')(
    () => ({ functionMiddleware: [overwrite] }),
  )
  const restore = createStartModule('@review/optional-function-restore')(() =>
    enabled ? { functionMiddleware: [restorePermission] as const } : {},
  )
  const start = createStart(() => ({
    functionMiddleware: [permission],
    extends: [destroy, restore],
  }))
  type Result = ValidateStartModules<
    typeof start,
    [typeof destroy, typeof restore],
    ['@review/optional-function-provider']
  >
  expectTypeOf<Result>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional restoration leaves a numeric context on one runtime path
  type _Result = AssertStartModules<Result>
})
