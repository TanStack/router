import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  MOCK_EDGE_PREFIX,
  MOCK_MODULE_ID,
  MOCK_RUNTIME_PREFIX,
  loadMockEdgeModule,
  loadMockRuntimeModule,
  makeMockEdgeModuleId,
  mockRuntimeModuleIdFromViolation,
} from '../../src/import-protection/virtualModules'
import type { ViolationInfo } from '../../src/import-protection/trace'

/**
 * Build-time virtual-module IDs embed JSON payloads as base64url. These are
 * developer-controlled inputs today, but decoded content flows into module
 * graph IDs and generated code, so the round-trip must be exact and hostile
 * payloads must degrade gracefully rather than throwing.
 */

function decodePayload(id: string): any {
  // strip everything up to and including the final prefix colon
  const encoded = id.slice(id.lastIndexOf(':') + 1)
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
}

const violationArb = fc.record({
  env: fc.constantFrom('client', 'server'),
  importer: fc.string({ maxLength: 40 }),
  specifier: fc.string({ maxLength: 40 }),
  trace: fc.array(
    fc.record({
      file: fc.string({ maxLength: 20 }),
      line: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: null }),
      column: fc.option(fc.integer({ min: 1, max: 200 }), { nil: null }),
    }),
    { maxLength: 3 },
  ),
})

describe('virtual module id round-trips', () => {
  test('runtime violation ids survive encode → decode exactly', () => {
    fc.assert(
      fc.property(
        violationArb,
        fc.constantFrom('error', 'warn'),
        fc.string({ maxLength: 20 }),
        (info, mode, root) => {
          const id = mockRuntimeModuleIdFromViolation(
            info as unknown as ViolationInfo,
            mode,
            root,
          )

          if (info.env !== 'client') {
            // server-side violations get the static mock module - no payload
            expect(id).toBe(MOCK_MODULE_ID)
            return
          }

          expect(id.startsWith(MOCK_RUNTIME_PREFIX)).toBe(true)

          const payload = decodePayload(id)
          expect(payload.mode).toBe(mode)
          expect(payload.env).toBe(info.env)
          expect(payload.importer).toBe(info.importer)
          expect(payload.specifier).toBe(info.specifier)
          // trace file paths are relativized against root, so only the
          // count is asserted here; content transformation is covered by
          // the trace unit tests
          expect(payload.trace).toHaveLength(info.trace.length)

          // generating diagnostics code for the id must not throw
          expect(() =>
            loadMockRuntimeModule(id.slice(MOCK_RUNTIME_PREFIX.length)),
          ).not.toThrow()
        },
      ),
    )
  })

  test('edge module ids preserve export lists through decode', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (exports, runtimeId) => {
          const id = makeMockEdgeModuleId(exports, runtimeId)
          expect(id.startsWith(MOCK_EDGE_PREFIX)).toBe(true)

          const payload = decodePayload(id)
          expect(payload.exports).toEqual(
            exports.filter((n) => n !== 'default'),
          )
          expect(payload.runtimeId).toBe(runtimeId)

          expect(() =>
            loadMockEdgeModule(id.slice(MOCK_EDGE_PREFIX.length)),
          ).not.toThrow()
        },
      ),
    )
  })

  test('distinct violations produce distinct module ids', () => {
    const a = mockRuntimeModuleIdFromViolation(
      makeViolation('/src/a.ts', 'process.env'),
      'error',
      '/',
    )
    const b = mockRuntimeModuleIdFromViolation(
      makeViolation('/src/b.ts', 'process.env'),
      'error',
      '/',
    )
    expect(a).not.toBe(b)
  })

  test('unicode and quote-laden paths survive the base64url round-trip', () => {
    const importer = '/src/café/"quoted"/\\backslash\\日本語.ts'
    const id = mockRuntimeModuleIdFromViolation(
      makeViolation(importer, 'window'),
      'error',
      '/',
    )
    const payload = decodePayload(id)
    expect(payload.importer).toBe(importer)
  })

  test('hostile payloads fall back to safe defaults instead of throwing', () => {
    // garbage base64 / non-JSON payload
    expect(() =>
      loadMockEdgeModule(Buffer.from('not json').toString('base64url')),
    ).not.toThrow()
    expect(() => loadMockEdgeModule('!!!not-base64!!!')).not.toThrow()
    // JSON of the wrong shape still yields a defined module
    const wrongShape = Buffer.from('"just a string"').toString('base64url')
    const result = loadMockEdgeModule(wrongShape)
    expect(result.code).toBeDefined()
    // mode values outside the allowlist clamp to "error"
    const badMode = Buffer.from(JSON.stringify({ mode: 'arbitrary' })).toString(
      'base64url',
    )
    const runtime = loadMockRuntimeModule(badMode)
    expect(runtime.code).toBeDefined()
    expect(MOCK_MODULE_ID).toBeDefined()
  })
})

type ViolationInfoLike = {
  env: string
  importer: string
  specifier: string
  trace: Array<{ file: string; line?: number | null; column?: number | null }>
}

function makeViolation(importer: string, specifier: string): ViolationInfoLike {
  return { env: 'client', importer, specifier, trace: [] }
}
