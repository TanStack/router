import { expectTypeOf, test } from 'vitest'
import type { ErrorComponentProps } from '../src'

test('error prop is unknown', () => {
  expectTypeOf<ErrorComponentProps['error']>().toBeUnknown()
})

test('error-specific properties are accessible after narrowing', () => {
  const narrowed = (props: ErrorComponentProps) =>
    props.error instanceof Error ? props.error.message : String(props.error)

  expectTypeOf(narrowed).returns.toEqualTypeOf<string>()
})

test('error-specific properties are inaccessible without narrowing', () => {
  const unnarrowed = (props: ErrorComponentProps) =>
    // @ts-expect-error - `error` is `unknown`; narrow it before accessing `message`
    props.error.message

  expectTypeOf(unnarrowed).toBeFunction()
})
