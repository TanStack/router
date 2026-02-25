import { describe, expect, test } from 'vitest'
import {
  MOCK_EDGE_PREFIX,
  MOCK_MODULE_ID,
  MOCK_RUNTIME_PREFIX,
  loadMarkerModule,
  loadMockEdgeModule,
  loadMockRuntimeModule,
  loadSilentMockModule,
  makeMockEdgeModuleId,
  mockRuntimeModuleIdFromViolation,
} from '../../src/import-protection-plugin/virtualModules'
import type { ViolationInfo } from '../../src/import-protection-plugin/trace'

describe('loadSilentMockModule', () => {
  test('returns mock code', () => {
    const result = loadSilentMockModule()
    expect(result.code).toContain('export default mock')
    expect(result.code).toContain('createMock')
    expect(result.code).toContain('Proxy')
    expect(result.code).toContain('@__NO_SIDE_EFFECTS__')
    expect(result.code).toContain('@__PURE__')
  })
})

describe('loadMockEdgeModule', () => {
  test('does not add PURE annotations to property reads', () => {
    const encodedPayload = Buffer.from(
      JSON.stringify({ exports: ['foo', 'bar'], runtimeId: 'x' }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

    const result = loadMockEdgeModule(encodedPayload)
    expect(result.code).toContain('export const foo = mock.foo')
    expect(result.code).toContain('export const bar = mock.bar')
    expect(result.code).not.toContain('@__PURE__ */ mock.')
  })
})

describe('loadMarkerModule', () => {
  test('returns empty module', () => {
    const result = loadMarkerModule()
    expect(result.code).toBe('export {}')
  })
})

describe('loadMockEdgeModule', () => {
  test('generates named exports from payload', () => {
    const payload = JSON.stringify({
      source: './secret.server',
      exports: ['getSecret', 'initDb'],
      runtimeId: MOCK_MODULE_ID,
    })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockEdgeModule(encoded)

    expect(result.code).toContain('export const getSecret')
    expect(result.code).toContain('export const initDb')
    expect(result.code).toContain('export default mock')
  })

  test('handles empty exports array', () => {
    const payload = JSON.stringify({
      source: './x',
      exports: [],
      runtimeId: MOCK_MODULE_ID,
    })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockEdgeModule(encoded)

    expect(result.code).toContain('export default mock')
    expect(result.code).not.toContain('export const')
  })

  test('handles string-keyed (non-identifier) export names via re-export', () => {
    const payload = JSON.stringify({
      source: './x',
      exports: ['valid', 'default', '123invalid', 'also-invalid'],
      runtimeId: MOCK_MODULE_ID,
    })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockEdgeModule(encoded)

    // Valid identifier: direct const export
    expect(result.code).toContain('export const valid')
    // 'default' is filtered out
    expect(result.code).not.toContain('export const default')
    // Non-identifiers get string-keyed re-exports
    expect(result.code).toContain('__tss_str_')
    expect(result.code).toContain('"123invalid"')
    expect(result.code).toContain('"also-invalid"')
  })

  test('handles malformed base64', () => {
    const result = loadMockEdgeModule('not-valid-base64!!!')
    expect(result.code).toContain('export default mock')
  })

  test('falls back to MOCK_MODULE_ID when runtimeId missing', () => {
    const payload = JSON.stringify({
      source: './x',
      exports: ['a'],
    })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockEdgeModule(encoded)

    expect(result.code).toContain(MOCK_MODULE_ID)
  })
})

describe('loadMockRuntimeModule', () => {
  test('generates runtime diagnostic module with error mode', () => {
    const payload = JSON.stringify({
      mode: 'error',
      env: 'client',
      importer: '/src/routes/index.tsx',
      specifier: './secret.server',
      trace: ['src/main.tsx', 'src/routes/index.tsx'],
    })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockRuntimeModule(encoded)

    expect(result.code).toContain('__report')
    expect(result.code).toContain('console.error')
    expect(result.code).toContain('"error"')
    expect(result.code).toContain('export default mock')
  })

  test('generates warn mode module', () => {
    const payload = JSON.stringify({ mode: 'warn' })
    const encoded = Buffer.from(payload, 'utf8').toString('base64url')
    const result = loadMockRuntimeModule(encoded)

    expect(result.code).toContain('"warn"')
    expect(result.code).toContain('console.warn')
  })

  test('handles malformed payload gracefully', () => {
    const result = loadMockRuntimeModule('bad-data')
    expect(result.code).toContain('export default mock')
  })
})

describe('mockRuntimeModuleIdFromViolation', () => {
  const baseViolation: ViolationInfo = {
    env: 'client',
    envType: 'client',
    type: 'file',
    behavior: 'mock',
    specifier: './secret.server',
    importer: '/project/src/routes/index.tsx',
    trace: [
      { file: '/project/src/main.tsx' },
      { file: '/project/src/routes/index.tsx', specifier: './secret.server' },
    ],
    message: 'Import denied',
  }

  test('returns MOCK_MODULE_ID when mode is off', () => {
    const id = mockRuntimeModuleIdFromViolation(
      baseViolation,
      'off',
      '/project',
    )
    expect(id).toBe(MOCK_MODULE_ID)
  })

  test('returns MOCK_MODULE_ID for non-client env', () => {
    const ssrViolation = { ...baseViolation, env: 'ssr' }
    const id = mockRuntimeModuleIdFromViolation(
      ssrViolation,
      'error',
      '/project',
    )
    expect(id).toBe(MOCK_MODULE_ID)
  })

  test('returns runtime module ID for client env with error mode', () => {
    const id = mockRuntimeModuleIdFromViolation(
      baseViolation,
      'error',
      '/project',
    )
    expect(id.startsWith(MOCK_RUNTIME_PREFIX)).toBe(true)
    const encoded = id.slice(MOCK_RUNTIME_PREFIX.length)
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    expect(payload.env).toBe('client')
    expect(payload.mode).toBe('error')
    expect(payload.specifier).toBe('./secret.server')
  })

  test('includes relative trace paths', () => {
    const id = mockRuntimeModuleIdFromViolation(
      baseViolation,
      'warn',
      '/project',
    )
    const encoded = id.slice(MOCK_RUNTIME_PREFIX.length)
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    expect(payload.trace[0]).toBe('src/main.tsx')
  })

  test('includes line numbers in trace when present', () => {
    const violation: ViolationInfo = {
      ...baseViolation,
      trace: [
        { file: '/project/src/main.tsx' },
        {
          file: '/project/src/routes/index.tsx',
          specifier: './secret.server',
          line: 5,
          column: 10,
        },
      ],
    }
    const id = mockRuntimeModuleIdFromViolation(violation, 'error', '/project')
    const encoded = id.slice(MOCK_RUNTIME_PREFIX.length)
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    expect(payload.trace[1]).toBe('src/routes/index.tsx:5:10')
  })
})

describe('makeMockEdgeModuleId', () => {
  test('encodes exports and source into module ID', () => {
    const id = makeMockEdgeModuleId(
      ['foo', 'bar'],
      './secret.server',
      MOCK_MODULE_ID,
    )
    expect(id.startsWith(MOCK_EDGE_PREFIX)).toBe(true)
    const encoded = id.slice(MOCK_EDGE_PREFIX.length)
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    expect(payload.source).toBe('./secret.server')
    expect(payload.exports).toEqual(['foo', 'bar'])
    expect(payload.runtimeId).toBe(MOCK_MODULE_ID)
  })

  test('handles empty exports', () => {
    const id = makeMockEdgeModuleId([], './x', MOCK_MODULE_ID)
    const encoded = id.slice(MOCK_EDGE_PREFIX.length)
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    expect(payload.exports).toEqual([])
  })
})
