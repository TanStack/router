import type { AnyValidator } from './validators'

const rawSearchInputMarker = Symbol('tanstack.router.rawSearchInput')

type RawSearchInputMarked = {
  [rawSearchInputMarker]: true
}

/**
 * Marks a search validator so route matching passes raw URL search values
 * instead of the default parsed/coerced search object.
 */
export function validateSearchWithRawInput<
  TValidator extends Exclude<AnyValidator, undefined>,
>(validator: TValidator): TValidator {
  if ('~standard' in validator) {
    return {
      '~standard': validator['~standard'],
      [rawSearchInputMarker]: true,
    } as unknown as TValidator
  }

  if ('parse' in validator) {
    const wrapped: Record<string, unknown> = {
      parse: (input: unknown) => validator.parse(input),
      [rawSearchInputMarker]: true,
    }

    if ('types' in validator) {
      wrapped.types = validator.types
    }

    return wrapped as unknown as TValidator
  }

  const wrapped = ((input: unknown) =>
    validator(input as never)) as TValidator & RawSearchInputMarked
  wrapped[rawSearchInputMarker] = true
  return wrapped
}

export function validatorUsesRawSearchInput(
  validator: AnyValidator,
): validator is Exclude<AnyValidator, undefined> & RawSearchInputMarked {
  return Boolean(
    validator &&
    (typeof validator === 'object' || typeof validator === 'function') &&
    rawSearchInputMarker in validator,
  )
}
