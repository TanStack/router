import { resolveViteId } from '../utils'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { isValidExportName } from './rewriteDeniedImports'
import { CLIENT_ENV_SUGGESTIONS } from './trace'
import { relativizePath } from './utils'
import type { ViolationInfo } from './trace'

export const MOCK_MODULE_ID = 'tanstack-start-import-protection:mock'
export const RESOLVED_MOCK_MODULE_ID = resolveViteId(MOCK_MODULE_ID)

export const MOCK_EDGE_PREFIX = 'tanstack-start-import-protection:mock-edge:'
export const RESOLVED_MOCK_EDGE_PREFIX = resolveViteId(MOCK_EDGE_PREFIX)

export const MOCK_RUNTIME_PREFIX =
  'tanstack-start-import-protection:mock-runtime:'
export const RESOLVED_MOCK_RUNTIME_PREFIX = resolveViteId(MOCK_RUNTIME_PREFIX)

export const MARKER_PREFIX = 'tanstack-start-import-protection:marker:'
export const RESOLVED_MARKER_PREFIX = resolveViteId(MARKER_PREFIX)

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

type MockAccessMode = 'error' | 'warn' | 'off'

/**
 * Compact runtime suggestion text for browser console, derived from
 * {@link CLIENT_ENV_SUGGESTIONS} so there's a single source of truth.
 */
export const RUNTIME_SUGGESTION_TEXT =
  'Fix: ' +
  CLIENT_ENV_SUGGESTIONS.join('. ') +
  '. To disable these runtime diagnostics, set importProtection.mockAccess: "off".'

export function mockRuntimeModuleIdFromViolation(
  info: ViolationInfo,
  mode: MockAccessMode,
  root: string,
): string {
  if (mode === 'off') return MOCK_MODULE_ID
  if (info.env !== VITE_ENVIRONMENT_NAMES.client) return MOCK_MODULE_ID

  const rel = (p: string) => relativizePath(p, root)
  const trace = info.trace.map((s) => {
    const file = rel(s.file)
    if (s.line == null) return file
    return `${file}:${s.line}:${s.column ?? 1}`
  })

  const payload = {
    env: info.env,
    importer: info.importer,
    specifier: info.specifier,
    trace,
    mode,
  }
  return `${MOCK_RUNTIME_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

export function makeMockEdgeModuleId(
  exports: Array<string>,
  source: string,
  runtimeId: string,
): string {
  const payload = { source, exports, runtimeId }
  return `${MOCK_EDGE_PREFIX}${toBase64Url(JSON.stringify(payload))}`
}

/**
 * Generate a recursive Proxy-based mock module.
 *
 * When `diagnostics` is provided, the generated code includes a `__report`
 * function that logs runtime warnings/errors when the mock is actually used
 * (property access for primitive coercion, calls, construction, sets).
 *
 * When `diagnostics` is omitted, the mock is completely silent — suitable
 * for the shared `MOCK_MODULE_ID` that uses `syntheticNamedExports`.
 */
function generateMockCode(diagnostics?: {
  meta: {
    env: string
    importer: string
    specifier: string
    trace: Array<unknown>
  }
  mode: 'error' | 'warn' | 'off'
}): string {
  const fnName = diagnostics ? '__createMock' : 'createMock'
  const hasDiag = !!diagnostics

  const preamble = hasDiag
    ? `const __meta = ${JSON.stringify(diagnostics.meta)};
const __mode = ${JSON.stringify(diagnostics.mode)};

const __seen = new Set();
function __report(action, accessPath) {
  if (__mode === 'off') return;
  const key = action + ':' + accessPath;
  if (__seen.has(key)) return;
  __seen.add(key);

  const traceLines = Array.isArray(__meta.trace) && __meta.trace.length
    ? "\\n\\nTrace:\\n" + __meta.trace.map((t, i) => '  ' + (i + 1) + '. ' + String(t)).join('\\n')
    : '';

  const msg =
    '[import-protection] Mocked import used in dev client\\n\\n' +
    'Denied import: "' + __meta.specifier + '"\\n' +
    'Importer: ' + __meta.importer + '\\n' +
    'Access: ' + accessPath + ' (' + action + ')' +
    traceLines +
    '\\n\\n' + ${JSON.stringify(RUNTIME_SUGGESTION_TEXT)};

  const err = new Error(msg);
  if (__mode === 'warn') {
    console.warn(err);
  } else {
    console.error(err);
  }
}
`
    : ''

  // Diagnostic-only traps for primitive coercion, set
  const diagGetTraps = hasDiag
    ? `
      if (prop === Symbol.toPrimitive) {
        return () => {
          __report('toPrimitive', name);
          return '[import-protection mock]';
        };
      }
      if (prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
        return () => {
          __report(String(prop), name);
          return '[import-protection mock]';
        };
      }`
    : ''

  const applyBody = hasDiag
    ? `__report('call', name + '()');
      return ${fnName}(name + '()');`
    : `return ${fnName}(name + '()');`

  const constructBody = hasDiag
    ? `__report('construct', 'new ' + name);
      return ${fnName}('new ' + name);`
    : `return ${fnName}('new ' + name);`

  const setTrap = hasDiag
    ? `
    set(_target, prop) {
      __report('set', name + '.' + String(prop));
      return true;
    },`
    : ''

  return `
${preamble}function ${fnName}(name) {
  const fn = function () {};
  fn.prototype.name = name;
  const children = Object.create(null);
  const proxy = new Proxy(fn, {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (prop === 'caller') return null;
      if (prop === 'then') return (f) => Promise.resolve(f(proxy));
      if (prop === 'catch') return () => Promise.resolve(proxy);
      if (prop === 'finally') return (f) => { f(); return Promise.resolve(proxy); };${diagGetTraps}
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in children)) {
        children[prop] = ${fnName}(name + '.' + prop);
      }
      return children[prop];
    },
    apply() {
      ${applyBody}
    },
    construct() {
      ${constructBody}
    },${setTrap}
  });
  return proxy;
}
const mock = ${fnName}('mock');
export default mock;
`
}

export function loadSilentMockModule(): {
  syntheticNamedExports: boolean
  code: string
} {
  return { syntheticNamedExports: true, code: generateMockCode() }
}

export function loadMockEdgeModule(encodedPayload: string): { code: string } {
  let payload: { exports?: Array<string>; runtimeId?: string }
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as typeof payload
  } catch {
    payload = { exports: [] }
  }
  const names: Array<string> = Array.isArray(payload.exports)
    ? payload.exports.filter(
        (n): n is string =>
          typeof n === 'string' && n.length > 0 && n !== 'default',
      )
    : []

  const runtimeId: string =
    typeof payload.runtimeId === 'string' && payload.runtimeId.length > 0
      ? payload.runtimeId
      : MOCK_MODULE_ID

  const exportLines: Array<string> = []
  const stringExports: Array<{ alias: string; name: string }> = []

  for (let i = 0; i < names.length; i++) {
    const n = names[i]!
    if (isValidExportName(n)) {
      exportLines.push(`export const ${n} = mock.${n};`)
    } else {
      // ES2022 string-keyed export: use a temp var + re-export with string literal
      const alias = `__tss_str_${i}`
      exportLines.push(`const ${alias} = mock[${JSON.stringify(n)}];`)
      stringExports.push({ alias, name: n })
    }
  }

  if (stringExports.length > 0) {
    const reexports = stringExports
      .map((s) => `${s.alias} as ${JSON.stringify(s.name)}`)
      .join(', ')
    exportLines.push(`export { ${reexports} };`)
  }

  return {
    code: `import mock from ${JSON.stringify(runtimeId)};
${exportLines.join('\n')}
export default mock;
`,
  }
}

export function loadMockRuntimeModule(encodedPayload: string): {
  code: string
} {
  let payload: {
    mode?: string
    env?: string
    importer?: string
    specifier?: string
    trace?: Array<unknown>
  }
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as typeof payload
  } catch {
    payload = {}
  }

  const mode: 'error' | 'warn' | 'off' =
    payload.mode === 'warn' || payload.mode === 'off' ? payload.mode : 'error'

  const meta = {
    env: String(payload.env ?? ''),
    importer: String(payload.importer ?? ''),
    specifier: String(payload.specifier ?? ''),
    trace: Array.isArray(payload.trace) ? payload.trace : [],
  }

  return { code: generateMockCode({ meta, mode }) }
}

const MARKER_MODULE_RESULT = { code: 'export {}' } as const

export function loadMarkerModule(): { code: string } {
  return MARKER_MODULE_RESULT
}
