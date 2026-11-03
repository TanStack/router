import { expectTypeOf, test } from 'vitest'
import { createMiddleware, createStart } from '../index'
import type { ValidateStartModules } from '../index'

type Credentials =
  | { kind: 'user'; user: string }
  | { kind: 'token'; token: string }

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/scalable-context-walk': { requestContext: { viewer: string } }
    '@review/indexed-context-walk': { functionContext: Record<string, string> }
    '@review/correlated-context-walk': { functionContext: Credentials }
  }
}

const viewer = createMiddleware().server(({ next }) =>
  next({ context: { viewer: 'benchmark' } }),
)
const sharedAudit = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { auditTag: 'host' } }),
)

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit0 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency0 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit0])
  .server(({ next }) => next({ context: { step0: true } }))
const middleware0 = createMiddleware({ type: 'function' })
  .middleware([dependency0, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit1 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency1 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit1])
  .server(({ next }) => next({ context: { step1: true } }))
const middleware1 = createMiddleware({ type: 'function' })
  .middleware([dependency1, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit2 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency2 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit2])
  .server(({ next }) => next({ context: { step2: true } }))
const middleware2 = createMiddleware({ type: 'function' })
  .middleware([dependency2, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit3 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency3 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit3])
  .server(({ next }) => next({ context: { step3: true } }))
const middleware3 = createMiddleware({ type: 'function' })
  .middleware([dependency3, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit4 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency4 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit4])
  .server(({ next }) => next({ context: { step4: true } }))
const middleware4 = createMiddleware({ type: 'function' })
  .middleware([dependency4, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit5 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency5 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit5])
  .server(({ next }) => next({ context: { step5: true } }))
const middleware5 = createMiddleware({ type: 'function' })
  .middleware([dependency5, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit6 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency6 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit6])
  .server(({ next }) => next({ context: { step6: true } }))
const middleware6 = createMiddleware({ type: 'function' })
  .middleware([dependency6, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

// This object differs from sharedAudit at runtime but has the same type.
const independentAudit7 = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auditTag: 'fragment' } }),
)
const dependency7 = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit7])
  .server(({ next }) => next({ context: { step7: true } }))
const middleware7 = createMiddleware({ type: 'function' })
  .middleware([dependency7, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends 1 & typeof context.auditTag
      ? never
      : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })

test('nested middleware chains do not enumerate unrelated context combinations', () => {
  const start = createStart(() => ({
    requestMiddleware: [viewer],
    functionMiddleware: [
      sharedAudit,
      middleware0,
      middleware1,
      middleware2,
      middleware3,
      middleware4,
      middleware5,
      middleware6,
      middleware7,
    ],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/scalable-context-walk']>
  >().toEqualTypeOf<true>()
})

test('indexed requirements retain every supplied property', () => {
  const incompatible = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { visible: 'value', unexpected: 42 } }),
  )
  const start = createStart(() => ({ functionMiddleware: [incompatible] }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/indexed-context-walk']>
  >().not.toEqualTypeOf<true>()
})

test('an index signature does not establish a required named property', () => {
  const context: Record<string, string> = {}
  const indexed = createMiddleware().server(({ next }) => next({ context }))
  const start = createStart(() => ({ requestMiddleware: [indexed] }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/scalable-context-walk']>
  >().not.toEqualTypeOf<true>()
})

test('required context projections preserve correlated union alternatives', () => {
  const credentials: Credentials =
    Math.random() > 0.5
      ? { kind: 'user', user: 'user' }
      : { kind: 'token', token: 'token' }
  const provider = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: credentials }),
  )
  const start = createStart(() => ({ functionMiddleware: [provider] }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/correlated-context-walk']>
  >().toEqualTypeOf<true>()
})
