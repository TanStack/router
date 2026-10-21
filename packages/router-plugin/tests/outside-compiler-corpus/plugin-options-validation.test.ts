/**
 * Not part of the compiler test corpus (B-other, SYNTHESIS N1/N2; moved from
 * plugin-options.test.ts): the public plugin factory refuses invalid
 * `codeSplittingOptions` synchronously, when it is created. No route is
 * compiled: this is option validation of the package, not a compiler job
 * (J1–J3). What a route's own repeated groupings do is decided in the
 * corpus: plugin-options.test.ts ("in a route are refused with an error
 * naming the route file and the option").
 */
import { describe, expect, test } from 'vitest'
import { tanstackRouter } from '../../src/vite'

describe('codeSplittingOptions.splitBehavior', () => {
  test('that is not a function is refused when the plugin is created, naming the option', () => {
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: { splitBehavior: [['loader']] as any },
      }),
    ).toThrow(/splitBehavior/)
  })
})

describe('repeated options in split groupings', () => {
  test('in defaultBehavior are refused with an error naming the option', () => {
    expect(() =>
      tanstackRouter({
        codeSplittingOptions: {
          defaultBehavior: [['loader'], ['loader', 'component']],
        },
      }),
    ).toThrow(
      /loader[\s\S]*(?:unique|repeated|more than once|duplicate)|(?:unique|repeated|more than once|duplicate)[\s\S]*loader/i,
    )
  })
})
