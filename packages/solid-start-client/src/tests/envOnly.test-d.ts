import { expectTypeOf, test } from 'vitest'
import { clientOnly, serverOnly } from '../envOnly'

const inputFn = () => 'output'

const genericInputFn = <T>(input: T) => input

function overloadedFn(input: string): string
function overloadedFn(input: number): number
function overloadedFn(input: any) {
  return input
}

test("clientOnly returns the function it's given", () => {
  const outputFn = clientOnly(inputFn)
  expectTypeOf(outputFn).toEqualTypeOf<typeof inputFn>()

  const genericOutputFn = clientOnly(genericInputFn)
  expectTypeOf(genericOutputFn).toEqualTypeOf<typeof genericInputFn>()

  const overloadedOutputFn = clientOnly(overloadedFn)
  expectTypeOf(overloadedOutputFn).toEqualTypeOf<typeof overloadedFn>()
})

test("serverOnly returns the function it's given", () => {
  const outputFn = serverOnly(inputFn)
  expectTypeOf(outputFn).toEqualTypeOf<typeof inputFn>()

  const genericOutputFn = serverOnly(genericInputFn)
  expectTypeOf(genericOutputFn).toEqualTypeOf<typeof genericInputFn>()

  const overloadedOutputFn = serverOnly(overloadedFn)
  expectTypeOf(overloadedOutputFn).toEqualTypeOf<typeof overloadedFn>()
})
