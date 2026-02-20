import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

interface TraceStep {
  file: string
  specifier?: string
  line?: number
  column?: number
}

interface CodeSnippet {
  lines: Array<string>
  location?: string
}

interface Violation {
  type: string
  specifier: string
  importer: string
  resolved?: string
  trace: Array<TraceStep>
  snippet?: CodeSnippet
  envType?: string
}

async function readViolations(
  type: 'build' | 'dev',
): Promise<Array<Violation>> {
  const filename = `violations.${type}.json`
  const violationsPath = path.resolve(import.meta.dirname, '..', filename)
  const mod = await import(violationsPath, {
    with: { type: 'json' },
  } as any)
  return (mod.default ?? []) as Array<Violation>
}

test.use({
  // The mock proxy returns undefined-ish values, which may cause
  // React rendering warnings — whitelist those
  whitelistErrors: [/mock/i, /Cannot read properties/i, /undefined/i],
})

test('app loads successfully with mock mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('heading')).toContainText(
    'Import Protection E2E',
  )
  await expect(page.getByTestId('status')).toContainText(
    'App loaded successfully with mock mode',
  )
})

test('leaky server import route loads in mock mode', async ({ page }) => {
  await page.goto('/leaky-server-import')
  await expect(page.getByTestId('leaky-heading')).toContainText(
    'Leaky Server Import',
  )
})

test('client-only violations route loads in mock mode', async ({ page }) => {
  await page.goto('/client-only-violations')
  await expect(page.getByTestId('client-only-heading')).toContainText(
    'Client-Only Violations',
  )
})

test('violations.build.json is written during build', async () => {
  const violations = await readViolations('build')
  expect(violations.length).toBeGreaterThan(0)
})

test('violations.dev.json is written during dev', async () => {
  const violations = await readViolations('dev')
  expect(violations.length).toBeGreaterThan(0)
})

test('file-based violation: client importing .server. file', async () => {
  const violations = await readViolations('build')

  // Find violation for the secret.server.ts file
  const fileViolation = violations.find(
    (v) =>
      v.type === 'file' &&
      v.importer.includes('edge-a') &&
      (v.specifier.includes('secret.server') ||
        v.resolved?.includes('secret.server')),
  )

  expect(fileViolation).toBeDefined()
  expect(fileViolation!.envType).toBe('client')
})

test('marker violation: client importing server-only marked module', async () => {
  const violations = await readViolations('build')

  // Find the marker violation — it could manifest in two ways:
  // 1. As a 'marker' type when the marker import is processed
  // 2. As the resolved file being marked server-only and then imported from client
  const markerViolation = violations.find(
    (v) =>
      v.type === 'marker' &&
      (v.importer.includes('marked-server-only') ||
        v.resolved?.includes('marked-server-only') ||
        v.specifier.includes('server-only')),
  )

  expect(markerViolation).toBeDefined()
})

test('violations contain trace information', async () => {
  const violations = await readViolations('build')

  // File-based violation should have trace info
  const fileViolation = violations.find(
    (v) =>
      v.type === 'file' &&
      (v.specifier.includes('secret.server') ||
        v.resolved?.includes('secret.server')),
  )

  expect(fileViolation).toBeDefined()
  // The trace should show the import chain
  expect(fileViolation!.trace).toBeDefined()
  expect(fileViolation!.trace.length).toBeGreaterThanOrEqual(2)
})

test('deep trace includes full chain', async () => {
  const violations = await readViolations('build')

  const v = violations.find(
    (x) => x.type === 'file' && x.importer.includes('edge-3'),
  )

  expect(v).toBeDefined()
  const traceText = v!.trace.map((s) => s.file).join(' -> ')
  expect(traceText).toContain('routes/index')
  expect(traceText).toContain('violations/edge-1')
  expect(traceText).toContain('violations/edge-2')
  expect(traceText).toContain('violations/edge-3')
})

test('all trace steps include line numbers', async () => {
  const violations = await readViolations('build')

  // Find a violation with a multi-step trace (the deep chain)
  const v = violations.find(
    (x) => x.type === 'file' && x.importer.includes('edge-3'),
  )
  expect(v).toBeDefined()
  expect(v!.trace.length).toBeGreaterThanOrEqual(3)

  // Every trace step (except possibly the entry) should have a line number.
  // The entry (step 0) may not have one if it has no specifier pointing into it.
  // All non-entry steps should have line numbers since they import something.
  for (let i = 1; i < v!.trace.length; i++) {
    const step = v!.trace[i]
    expect(
      step.line,
      `trace step ${i} (${step.file}) should have a line number`,
    ).toBeDefined()
    expect(step.line).toBeGreaterThan(0)
  }
})

test('leaf trace step includes the denied import specifier', async () => {
  const violations = await readViolations('build')

  const v = violations.find(
    (x) => x.type === 'file' && x.importer.includes('edge-a'),
  )
  expect(v).toBeDefined()

  // The last trace step should be the leaf (edge-a) and include the specifier
  const last = v!.trace[v!.trace.length - 1]
  expect(last.file).toContain('edge-a')
  expect(last.specifier).toContain('secret.server')
  expect(last.line).toBeDefined()
  expect(last.line).toBeGreaterThan(0)
})

test('violation includes code snippet showing offending usage', async () => {
  const violations = await readViolations('build')

  // File violation for edge-a should have a code snippet
  const v = violations.find(
    (x) => x.type === 'file' && x.importer.includes('edge-a'),
  )
  expect(v).toBeDefined()
  expect(v!.snippet).toBeDefined()
  expect(v!.snippet!.lines.length).toBeGreaterThan(0)

  // The snippet should contain the usage site of the denied import's binding.
  // The post-compile usage finder locates where `getSecret` is called (line 9),
  // which is more useful than pointing at the import statement itself.
  const snippetText = v!.snippet!.lines.join('\n')
  expect(snippetText).toContain('getSecret')

  // The snippet location should be a clickable file:line:col reference
  if (v!.snippet!.location) {
    expect(v!.snippet!.location).toMatch(/:\d+:\d+/)
  }
})

test('compiler leak violation includes line/col in importer', async () => {
  const violations = await readViolations('build')
  const v = violations.find(
    (x) => x.importer.includes('compiler-leak') && x.type === 'file',
  )
  expect(v).toBeDefined()

  // Should be clickable-ish: path:line:col
  expect(v!.importer).toMatch(/:\d+:\d+$/)
})

test('leaky @tanstack/react-start/server import points to usage site', async () => {
  const violations = await readViolations('build')
  const v = violations.find(
    (x) =>
      x.type === 'specifier' && x.specifier === '@tanstack/react-start/server',
  )
  expect(v).toBeDefined()

  // Importer should include a mapped location.
  expect(v!.importer).toContain('violations/leaky-server-import')
  expect(v!.importer).toMatch(/:\d+:\d+$/)
})

test('all client-env violations are in the client environment', async () => {
  const violations = await readViolations('build')

  // Server-only violations (client env importing server stuff)
  const clientViolations = violations.filter((v) => v.envType === 'client')
  expect(clientViolations.length).toBeGreaterThanOrEqual(2)
})

test('dev violations include client environment violations', async () => {
  const violations = await readViolations('dev')
  expect(violations.length).toBeGreaterThan(0)
  const clientViolations = violations.filter((v) => v.envType === 'client')
  expect(clientViolations.length).toBeGreaterThanOrEqual(1)
})

test('dev violations include code snippets', async () => {
  const violations = await readViolations('dev')

  // Find a file-based client violation (e.g. compiler-leak or edge-a importing secret.server)
  const fileViolation = violations.find(
    (v) =>
      v.type === 'file' &&
      v.envType === 'client' &&
      (v.specifier.includes('secret.server') ||
        v.resolved?.includes('secret.server')),
  )

  expect(fileViolation).toBeDefined()
  expect(fileViolation!.snippet).toBeDefined()
  expect(fileViolation!.snippet!.lines.length).toBeGreaterThan(0)

  // The snippet should show original source (not transformed/compiled output)
  const snippetText = fileViolation!.snippet!.lines.join('\n')
  expect(snippetText).toContain('getSecret')

  // The snippet location should be a clickable file:line:col reference
  if (fileViolation!.snippet!.location) {
    expect(fileViolation!.snippet!.location).toMatch(/:\d+:\d+/)
  }
})

test('no violation for .server import used only inside compiler boundaries', async () => {
  const violations = await readViolations('build')

  // boundary-safe.ts imports secret.server.ts, but the import should be pruned
  // from the client build because it is only referenced inside compiler
  // boundaries (createServerFn/createServerOnlyFn/createIsomorphicFn).
  const safeHits = violations.filter(
    (v) =>
      v.envType === 'client' &&
      (v.importer.includes('boundary-safe') ||
        v.trace.some((s) => s.file.includes('boundary-safe'))),
  )

  expect(safeHits).toEqual([])
})

test('compiler-processed module has code snippet in dev', async () => {
  const violations = await readViolations('dev')

  // compiler-leak.ts is processed by the Start compiler (createServerFn),
  // which shortens the output.  The snippet must still show the original
  // source lines (mapped via sourcesContent in the compiler's sourcemap).
  const compilerViolation = violations.find(
    (v) => v.envType === 'client' && v.importer.includes('compiler-leak'),
  )

  expect(compilerViolation).toBeDefined()
  expect(compilerViolation!.snippet).toBeDefined()
  expect(compilerViolation!.snippet!.lines.length).toBeGreaterThan(0)

  // The snippet should contain the original source, not compiled output
  const snippetText = compilerViolation!.snippet!.lines.join('\n')
  expect(snippetText).toContain('getSecret')
})

// ---------------------------------------------------------------------------
// Client-only violations: server (SSR) importing client-only code
// ---------------------------------------------------------------------------

test('file-based violation: SSR importing .client. file', async () => {
  const violations = await readViolations('build')

  const v = violations.find(
    (x) =>
      x.type === 'file' &&
      x.envType === 'server' &&
      (x.specifier.includes('browser-api.client') ||
        x.resolved?.includes('browser-api.client')),
  )

  expect(v).toBeDefined()
  expect(v!.envType).toBe('server')
  expect(v!.type).toBe('file')

  // Should have trace info leading back through the route
  expect(v!.trace.length).toBeGreaterThanOrEqual(2)
})

test('marker violation: SSR importing client-only marked module', async () => {
  const violations = await readViolations('build')

  const v = violations.find(
    (x) =>
      x.type === 'marker' &&
      x.envType === 'server' &&
      (x.importer.includes('marked-client-only') ||
        x.specifier.includes('client-only')),
  )

  expect(v).toBeDefined()
  expect(v!.envType).toBe('server')
  expect(v!.type).toBe('marker')
})

test('client-only JSX route loads in mock mode', async ({ page }) => {
  await page.goto('/client-only-jsx')
  await expect(page.getByTestId('client-only-jsx-heading')).toContainText(
    'Client-Only JSX',
  )
})

test('file-based violation: SSR importing .client. file with JSX usage', async () => {
  const violations = await readViolations('build')

  const v = violations.find(
    (x) =>
      x.type === 'file' &&
      x.envType === 'server' &&
      (x.specifier.includes('window-size.client') ||
        x.resolved?.includes('window-size.client')),
  )

  expect(v).toBeDefined()
  expect(v!.envType).toBe('server')
  expect(v!.type).toBe('file')

  // The snippet should show the JSX usage site where WindowSize() is called,
  // not just the import statement.
  expect(v!.snippet).toBeDefined()
  expect(v!.snippet!.lines.length).toBeGreaterThan(0)

  const snippetText = v!.snippet!.lines.join('\n')
  expect(snippetText).toContain('WindowSize')
})

test('build has violations in both client and SSR environments', async () => {
  const violations = await readViolations('build')

  const clientViolations = violations.filter((v) => v.envType === 'client')
  const ssrViolations = violations.filter((v) => v.envType === 'server')

  expect(clientViolations.length).toBeGreaterThanOrEqual(2)
  expect(ssrViolations.length).toBeGreaterThanOrEqual(2)
})

test('no false positive for factory-safe middleware pattern in dev', async () => {
  const violations = await readViolations('dev')

  // createSecretFactory.ts uses @tanstack/react-start/server and ../secret.server
  // ONLY inside createMiddleware().server() callbacks.  The compiler strips these
  // on the client, so import-protection must not fire for them.
  const factoryHits = violations.filter(
    (v) =>
      v.envType === 'client' &&
      (v.importer.includes('createSecretFactory') ||
        v.importer.includes('factory-safe') ||
        v.trace.some(
          (s) =>
            s.file.includes('createSecretFactory') ||
            s.file.includes('factory-safe'),
        )),
  )

  expect(factoryHits).toEqual([])
})

test('no false positive for boundary-safe pattern in dev', async () => {
  const violations = await readViolations('dev')

  // boundary-safe.ts imports secret.server.ts but only uses it inside
  // compiler boundaries (createServerFn/createServerOnlyFn/createIsomorphicFn).
  const safeHits = violations.filter(
    (v) =>
      v.envType === 'client' &&
      (v.importer.includes('boundary-safe') ||
        v.trace.some((s) => s.file.includes('boundary-safe'))),
  )

  expect(safeHits).toEqual([])
})
