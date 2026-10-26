/**
 * The J6.5 location check in the `client|server file:line:column` form the
 * import-protection tests compare violations in: the genuine surviving use,
 * any line of the original import, or the places the test writes out
 * (`others`); no coordinates only where the location is unavailable
 * (`unavailable`, SPEC §5.14: an import a tool rewrote), never as a blanket
 * escape.
 */
import { expect } from 'vitest'
import { isAt, locationParts } from './start-apps'

/** `[environment, location]` of `client file:line:column`. */
function splitEnvironment(value: string) {
  const match = /^(?:(client|server) )?(.*)$/.exec(value)!
  return [match[1], match[2]!] as const
}

/**
 * An asymmetric matcher of `use` (`[environment ]file:line:column`), any
 * column of the lines `importLines` of the same file, or one of `others`
 * (`file:line`, `file:line:column`, or `file` for no location; `isAt`).
 */
export function originalLocation(
  use: string,
  importLines: number | Array<number>,
  options: {
    /**
     * Also no coordinates: where the location is unavailable (SPEC §5.14: an
     * import a tool rewrote), or where a pin checks that it is there.
     */
    unavailable?: boolean
    /** Other accepted places (e.g. a marker's origin, SPEC J6.5). */
    others?: Array<string>
  } = {},
) {
  const [environment, location] = splitEnvironment(use)
  const { file } = locationParts(location)
  const places = [
    location,
    ...([] as Array<number>)
      .concat(importLines)
      .map((line) => `${file}:${line}`),
    ...(options.unavailable ? [file] : []),
    ...(options.others ?? []),
  ]
  return expect.toSatisfy(
    (value: unknown) => {
      if (typeof value !== 'string') {
        return false
      }
      const [actualEnvironment, actual] = splitEnvironment(value)
      return (
        actualEnvironment === environment &&
        places.some((place) => isAt(actual, place))
      )
    },
    `${environment ?? ''} ${places.join(' or ')}`,
  )
}
