import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath } from '../utils'

// Resolve at runtime so Vite does not rewrite the entry as an asset URL.
export const MOCK_MODULE_PATH = normalizePath(
  resolve(dirname(fileURLToPath(import.meta.url)), 'mock.js'),
)

export interface MockEdgePayload {
  exports: Array<string>
  runtimeId: string
  violation: {
    env: string
    envType: 'client' | 'server'
    importer: string
    specifier: string
    resolved?: string
    patternText: string
  }
}

export function createMockModuleId(
  kind: 'silent' | 'runtime' | 'edge',
  envName: string,
  payload?: unknown,
): string {
  const query = new URLSearchParams({
    'tanstack-start-mock': kind,
    env: envName,
  })
  if (payload !== undefined) {
    query.set(
      'payload',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
    )
  }
  return `${MOCK_MODULE_PATH}?${query}`
}

export function createRuntimeMockModuleId(opts: {
  envName: string
  mode: 'error' | 'warn' | 'off'
  importer: string
  specifier: string
}): string {
  return createMockModuleId('runtime', opts.envName, {
    mode: opts.mode,
    env: opts.envName,
    importer: opts.importer,
    specifier: opts.specifier,
    trace: [],
  })
}

export function getMockEdgePayload(
  resource: string,
): MockEdgePayload | undefined {
  if (!resource.startsWith(`${MOCK_MODULE_PATH}?`)) {
    return undefined
  }
  const query = new URLSearchParams(resource.slice(MOCK_MODULE_PATH.length + 1))
  const payload = query.get('payload')
  if (query.get('tanstack-start-mock') !== 'edge' || !payload) {
    return undefined
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}
