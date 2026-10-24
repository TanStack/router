/**
 * Lifecycle object form members whose function parameter is inferred from the
 * route (`handler`'s result, `dehydrate`'s wire value, the route context) and
 * must therefore never carry a type annotation.
 */
export const inferredParamProperties = [
  'dehydrate',
  'hydrate',
  'revalidate',
] as const
