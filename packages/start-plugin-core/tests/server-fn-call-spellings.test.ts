/**
 * The scan that tells which server fns a production client build calls
 * (SPEC J4.2, R182): the literals it looks for in the emitted code, and the
 * build error of two server fns of one spelling. Not an oracle test: it
 * calls the session's own scan (`callSpellings`, `calledIds`), as its
 * quote styles are a minifier's choice and a token collision (64 bits) has
 * no input a build could be given (design-rsc-phase2.md §4, test 8). The
 * builds' rows are in integration/start-build-server-fn-callable.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { callSpellings, calledIds, gateToken } from '../src/server-fns/ids'

const key = { rootRel: 'src/fns.ts', stableKey: 'save' }
const token = gateToken(key)
const fns = [{ id: 'placeholder-of-save', spelling: token, name: 'save' }]

describe('the callable scan of a build with a custom generator', () => {
  test('a token is # and 16 hex digits, one per server fn', () => {
    expect(token).toMatch(/^#[0-9a-f]{16}$/)
    expect(gateToken({ ...key, stableKey: 'load' })).not.toBe(token)
    expect(gateToken({ ...key, rootRel: 'src/other.ts' })).not.toBe(token)
  })

  test("code holding a custom id's text without the token admits nothing", () => {
    const codes = [
      `const a = "save", b = 'save', c = \`save\`; fetch("/_serverFn/save")`,
      `x(${JSON.stringify(token.slice(1))})`,
      `x("${token}0")`,
    ]
    expect(calledIds(codes, callSpellings(fns))).toEqual(new Set())
  })

  test.for([
    ['double', `y("/_serverFn/",x,"${token}")`],
    ['single', `y('/_serverFn/',x,'${token}')`],
    ['backtick', `y(\`/_serverFn/\`,x,\`${token}\`)`],
  ] as const)('the token in %s quotes admits its server fn', ([, code]) => {
    expect(calledIds([code], callSpellings(fns))).toEqual(
      new Set(['placeholder-of-save']),
    )
  })

  test('two server fns of one spelling fail the build, naming both', () => {
    expect(() =>
      callSpellings([
        { id: 'a-id', spelling: '#0123456789abcdef', name: 'a of src/a.ts' },
        { id: 'b-id', spelling: '#0123456789abcdef', name: 'b of src/b.ts' },
      ]),
    ).toThrow(/a of src\/a\.ts.*b of src\/b\.ts/)
  })
})
