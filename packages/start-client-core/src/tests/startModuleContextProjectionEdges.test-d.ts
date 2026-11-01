import { expectTypeOf, test } from 'vitest'
import { createMiddleware, createStart } from '../index'
import type { AssertStartModules, ValidateStartModules } from '../index'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/string-property-context': { functionContext: { '0': string } }
    '@review/number-property-context': { functionContext: { 0: string } }
    '@review/numeric-index-context': {
      functionContext: Record<`${number}`, string>
    }
    '@review/number-index-context': { functionContext: Record<number, string> }
    '@review/optional-property-context': { functionContext: { value?: number } }
    '@review/required-property-presence': {
      functionContext: { value: string | undefined }
    }
    '@review/independent-optional-fields': {
      functionContext: { value: string; other?: string }
    }
  }
}

// JavaScript has the same own property for these two spellings. Each provider
// must satisfy either spelling of the requirement, without changing its value.
const numericProperty = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { 0: 'credential' } }),
)
const stringProperty = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { '0': 'credential' } }),
)

test('a numeric property satisfies the same string-keyed requirement', () => {
  const start = createStart(() => ({
    functionMiddleware: [numericProperty],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/string-property-context']>
  >().toEqualTypeOf<true>()
})

test('a string property satisfies the same numeric-keyed requirement', () => {
  const start = createStart(() => ({
    functionMiddleware: [stringProperty],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/number-property-context']>
  >().toEqualTypeOf<true>()
})

test('equivalent property spellings still require compatible values', () => {
  const wrongNumeric = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { 0: 42 } }),
  )
  const wrongString = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { '0': 42 } }),
  )
  const numericStart = createStart(() => ({
    functionMiddleware: [wrongNumeric],
  }))
  const stringStart = createStart(() => ({
    functionMiddleware: [wrongString],
  }))
  type WrongNumeric = ValidateStartModules<
    typeof numericStart,
    [],
    ['@review/string-property-context']
  >
  type WrongString = ValidateStartModules<
    typeof stringStart,
    [],
    ['@review/number-property-context']
  >
  expectTypeOf<WrongNumeric>().not.toEqualTypeOf<true>()
  expectTypeOf<WrongString>().not.toEqualTypeOf<true>()
  // @ts-expect-error the existing property contains a number, not a string
  type _WrongNumeric = AssertStartModules<WrongNumeric>
  // @ts-expect-error the existing property contains a number, not a string
  type _WrongString = AssertStartModules<WrongString>
})

test('equivalent property spellings cannot hide an incompatible overwrite', () => {
  const wrongString = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { '0': 42 } }),
  )
  const wrongNumeric = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { 0: 42 } }),
  )
  const numericThenString = createStart(() => ({
    functionMiddleware: [numericProperty, wrongString],
  }))
  const stringThenNumeric = createStart(() => ({
    functionMiddleware: [stringProperty, wrongNumeric],
  }))
  type NumericThenString = ValidateStartModules<
    typeof numericThenString,
    [],
    ['@review/number-property-context']
  >
  type StringThenNumeric = ValidateStartModules<
    typeof stringThenNumeric,
    [],
    ['@review/string-property-context']
  >
  expectTypeOf<NumericThenString>().not.toEqualTypeOf<true>()
  expectTypeOf<StringThenNumeric>().not.toEqualTypeOf<true>()
  // @ts-expect-error the later string-spelled property overwrites the numeric one
  type _NumericThenString = AssertStartModules<NumericThenString>
  // @ts-expect-error the later numeric property overwrites the string-spelled one
  type _StringThenNumeric = AssertStartModules<StringThenNumeric>
})

test('a numeric template index checks finite numeric property values', () => {
  const valid = createStart(() => ({
    functionMiddleware: [numericProperty],
  }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [], ['@review/numeric-index-context']>
  >().toEqualTypeOf<true>()
  const wrong = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { '0': 42 } }),
  )
  const invalid = createStart(() => ({ functionMiddleware: [wrong] }))
  expectTypeOf<
    ValidateStartModules<typeof invalid, [], ['@review/numeric-index-context']>
  >().not.toEqualTypeOf<true>()
})

test('numeric template indexes cannot hide an incompatible overwrite', () => {
  const context: Record<`${number}`, number> = { '0': 42 }
  const indexed = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context }),
  )
  const start = createStart(() => ({
    functionMiddleware: [stringProperty, indexed],
  }))
  type Invalid = ValidateStartModules<
    typeof start,
    [],
    ['@review/string-property-context']
  >
  expectTypeOf<Invalid>().not.toEqualTypeOf<true>()
  // @ts-expect-error the indexed middleware can overwrite '0' with a number
  type _Invalid = AssertStartModules<Invalid>
})

test('a numeric index cannot hide an incompatible finite-property overwrite', () => {
  const context: Record<number, number> = { 0: 42 }
  const indexed = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context }),
  )
  const start = createStart(() => ({
    functionMiddleware: [stringProperty, indexed],
  }))
  type Invalid = ValidateStartModules<
    typeof start,
    [],
    ['@review/string-property-context']
  >
  expectTypeOf<Invalid>().not.toEqualTypeOf<true>()
  // @ts-expect-error the numeric index can overwrite the string-spelled field
  type _Invalid = AssertStartModules<Invalid>
})

test('a finite overwrite cannot retain an incompatible earlier index guarantee', () => {
  const context: Record<number, string> = { 0: 'first', 1: 'second' }
  const indexed = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context }),
  )
  const compatible = createStart(() => ({
    functionMiddleware: [indexed, stringProperty],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof compatible,
      [],
      ['@review/number-index-context']
    >
  >().toEqualTypeOf<true>()
  const wrong = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { '0': 42 } }),
  )
  const incompatible = createStart(() => ({
    functionMiddleware: [indexed, wrong],
  }))
  type Invalid = ValidateStartModules<
    typeof incompatible,
    [],
    ['@review/number-index-context']
  >
  expectTypeOf<Invalid>().not.toEqualTypeOf<true>()
  // @ts-expect-error one indexed value has been overwritten with a number
  type _Invalid = AssertStartModules<Invalid>
})

test('a later index signature cannot prove every earlier indexed key was replaced', () => {
  const strings: Record<number, string> = { 0: 'first' }
  const otherStrings: Record<number, string> = { 1: 'second' }
  const numbers: Record<number, number> = { 1: 42 }
  const stringIndex = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: strings }),
  )
  const numberIndex = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: numbers }),
  )
  const otherStringIndex = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: otherStrings }),
  )
  const compatible = createStart(() => ({
    functionMiddleware: [stringIndex, otherStringIndex],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof compatible,
      [],
      ['@review/number-index-context']
    >
  >().toEqualTypeOf<true>()
  const incompatible = createStart(() => ({
    functionMiddleware: [numberIndex, stringIndex],
  }))
  type Invalid = ValidateStartModules<
    typeof incompatible,
    [],
    ['@review/number-index-context']
  >
  expectTypeOf<Invalid>().not.toEqualTypeOf<true>()
  // @ts-expect-error stringIndex need not replace numeric key 1
  type _Invalid = AssertStartModules<Invalid>
})

test('an optional context field cannot prove an earlier incompatible value was replaced', () => {
  const oldValue = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { value: 'old' } }),
  )
  const context: { value?: number } = {}
  const optionalNumber = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context }),
  )
  const start = createStart(() => ({
    functionMiddleware: [oldValue, optionalNumber],
  }))
  type Invalid = ValidateStartModules<
    typeof start,
    [],
    ['@review/optional-property-context']
  >
  expectTypeOf<Invalid>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional output may leave the earlier string present
  type _Invalid = AssertStartModules<Invalid>

  const requiredNumber = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { value: 42 } }),
  )
  const repaired = createStart(() => ({
    functionMiddleware: [oldValue, optionalNumber, requiredNumber],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof repaired,
      [],
      ['@review/optional-property-context']
    >
  >().toEqualTypeOf<true>()
})

test('an optional compatible writer retains an already present context field', () => {
  const oldValue = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { value: 'old' } }),
  )
  const context: { value?: string } = {}
  const optionalString = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context }),
  )
  const start = createStart(() => ({
    functionMiddleware: [oldValue, optionalString],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof start,
      [],
      ['@review/required-property-presence']
    >
  >().toEqualTypeOf<true>()

  const optionalOnly = createStart(() => ({
    functionMiddleware: [optionalString],
  }))
  type Missing = ValidateStartModules<
    typeof optionalOnly,
    [],
    ['@review/required-property-presence']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  // @ts-expect-error the optional output alone does not establish presence
  type _Missing = AssertStartModules<Missing>
})

test('an unrelated optional field cannot weaken an existing required field', () => {
  const requiredValue = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { value: 'required' } }),
  )
  const context: { other?: string } = {}
  const optionalOther = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context }),
  )
  const start = createStart(() => ({
    functionMiddleware: [requiredValue, optionalOther],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof start,
      [],
      ['@review/independent-optional-fields']
    >
  >().toEqualTypeOf<true>()
})
