import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Violation } from './violations.utils'

async function readViolations(
  type: 'build' | 'dev' | 'dev.cold' | 'dev.warm',
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

for (const mode of ['build', 'dev'] as const) {
  test(`violations.${mode}.json is written during ${mode}`, async () => {
    const violations = await readViolations(mode)
    expect(violations.length).toBeGreaterThan(0)
  })
}

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

for (const mode of ['build', 'dev'] as const) {
  test(`violations contain trace information in ${mode}`, async () => {
    const violations = await readViolations(mode)

    const fileViolation = violations.find(
      (v) =>
        v.type === 'file' &&
        (v.specifier.includes('secret.server') ||
          v.resolved?.includes('secret.server')),
    )

    expect(fileViolation).toBeDefined()
    expect(fileViolation!.trace).toBeDefined()
    expect(fileViolation!.trace.length).toBeGreaterThanOrEqual(2)
  })
}

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

for (const mode of ['build', 'dev'] as const) {
  test(`all trace steps include line numbers in ${mode}`, async () => {
    const violations = await readViolations(mode)

    // Find a violation with a multi-step trace
    const v = violations.find((x) => x.type === 'file' && x.trace.length >= 3)
    expect(v).toBeDefined()

    // Every non-entry trace step should have a line number, except:
    // - Virtual specifiers (e.g. ?tsr-split=) injected by the router plugin
    // - routeTree.gen.ts steps (generated code, import locations unreliable)
    // - Steps immediately after ?tsr-split= (the re-entry from the split chunk)
    for (let i = 1; i < v!.trace.length; i++) {
      const step = v!.trace[i]
      if (step.specifier?.includes('?tsr-split=')) continue
      if (step.file.includes('routeTree.gen')) continue
      // In dev mode, the step right after a ?tsr-split= virtual step
      // re-enters the same file — its import may not be locatable.
      const prev = v!.trace[i - 1]
      if (prev?.specifier?.includes('?tsr-split=')) continue

      expect(
        step.line,
        `trace step ${i} (${step.file}) should have a line number`,
      ).toBeDefined()
      expect(step.line).toBeGreaterThan(0)
    }
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`leaf trace step includes the denied import specifier in ${mode}`, async () => {
    const violations = await readViolations(mode)

    const v = violations.find(
      (x) =>
        x.type === 'file' &&
        x.envType === 'client' &&
        (x.specifier.includes('secret.server') ||
          x.resolved?.includes('secret.server')),
    )
    expect(v).toBeDefined()

    const last = v!.trace[v!.trace.length - 1]
    expect(last.specifier).toContain('secret.server')
    expect(last.line).toBeDefined()
    expect(last.line).toBeGreaterThan(0)
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`violation includes code snippet showing offending usage in ${mode}`, async () => {
    const violations = await readViolations(mode)

    const v = violations.find(
      (x) =>
        x.type === 'file' &&
        x.envType === 'client' &&
        (x.specifier.includes('secret.server') ||
          x.resolved?.includes('secret.server')),
    )
    expect(v).toBeDefined()
    expect(v!.snippet).toBeDefined()
    expect(v!.snippet!.lines.length).toBeGreaterThan(0)

    const snippetText = v!.snippet!.lines.join('\n')
    expect(snippetText).toContain('getSecret')

    if (v!.snippet!.location) {
      expect(v!.snippet!.location).toMatch(/:\d+:\d+/)
    }
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`compiler leak violation includes line/col in importer in ${mode}`, async () => {
    const violations = await readViolations(mode)
    const v = violations.find(
      (x) => x.importer.includes('compiler-leak') && x.type === 'file',
    )
    expect(v).toBeDefined()
    expect(v!.importer).toMatch(/:\d+:\d+$/)
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`leaky @tanstack/react-start/server import points to usage site in ${mode}`, async () => {
    const violations = await readViolations(mode)
    const v = violations.find(
      (x) =>
        x.type === 'specifier' &&
        x.specifier === '@tanstack/react-start/server' &&
        x.importer.includes('leaky-server-import'),
    )
    expect(v).toBeDefined()
    expect(v!.importer).toContain('violations/leaky-server-import')
    expect(v!.importer).toMatch(/:\d+:\d+$/)
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`client-env violations exist in ${mode}`, async () => {
    const violations = await readViolations(mode)
    const clientViolations = violations.filter((v) => v.envType === 'client')
    expect(clientViolations.length).toBeGreaterThanOrEqual(
      mode === 'build' ? 2 : 1,
    )
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`no false positive for boundary-safe pattern in ${mode}`, async () => {
    const violations = await readViolations(mode)

    // boundary-safe.ts imports secret.server.ts but only uses it inside
    // compiler boundaries (createServerFn/createServerOnlyFn/createIsomorphicFn).
    const isBoundarySafe = (s: string) => /(?<![/-])boundary-safe/.test(s)
    const safeHits = violations.filter(
      (v) =>
        v.envType === 'client' &&
        (isBoundarySafe(v.importer) ||
          v.trace.some((s) => isBoundarySafe(s.file))),
    )

    expect(safeHits).toEqual([])
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`compiler-processed module has code snippet in ${mode}`, async () => {
    const violations = await readViolations(mode)

    // compiler-leak.ts is processed by the Start compiler (createServerFn),
    // which shortens the output.  The snippet must still show the original
    // source lines (mapped via sourcesContent in the compiler's sourcemap).
    const compilerViolation = violations.find(
      (v) => v.envType === 'client' && v.importer.includes('compiler-leak'),
    )

    expect(compilerViolation).toBeDefined()
    expect(compilerViolation!.snippet).toBeDefined()
    expect(compilerViolation!.snippet!.lines.length).toBeGreaterThan(0)

    const snippetText = compilerViolation!.snippet!.lines.join('\n')
    expect(snippetText).toContain('getSecret')
  })
}

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

for (const mode of ['build', 'dev'] as const) {
  test(`no false positive for factory-safe middleware pattern in ${mode}`, async () => {
    const violations = await readViolations(mode)

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
}

for (const mode of ['build', 'dev'] as const) {
  test(`no false positive for cross-boundary-safe pattern in ${mode}`, async () => {
    const violations = await readViolations(mode)

    // session-util.ts imports @tanstack/react-start/server, but it's only ever
    // imported by usage.ts which uses it exclusively inside compiler boundaries
    // (createServerFn().handler, createMiddleware().server).  The compiler should
    // prune the import chain from the client build.
    const crossHits = violations.filter(
      (v) =>
        v.envType === 'client' &&
        (v.importer.includes('cross-boundary-safe') ||
          v.importer.includes('session-util') ||
          v.trace.some(
            (s) =>
              s.file.includes('cross-boundary-safe') ||
              s.file.includes('session-util'),
          )),
    )

    expect(crossHits).toEqual([])
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`cross-boundary-leak: leaky consumer still produces violation in ${mode}`, async () => {
    const violations = await readViolations(mode)

    const leakHits = violations.filter(
      (v) =>
        v.envType === 'client' &&
        (v.importer.includes('cross-boundary-leak') ||
          v.importer.includes('shared-util') ||
          v.trace.some(
            (s) =>
              s.file.includes('leaky-consumer') ||
              s.file.includes('shared-util'),
          )),
    )

    expect(leakHits.length).toBeGreaterThanOrEqual(1)
  })
}

for (const mode of ['build', 'dev'] as const) {
  test(`beforeload-leak: server import via beforeLoad triggers client violation in ${mode}`, async () => {
    const violations = await readViolations(mode)

    const hits = violations.filter(
      (v) =>
        v.envType === 'client' &&
        (v.importer.includes('beforeload-server-leak') ||
          v.importer.includes('beforeload-leak') ||
          v.trace.some(
            (s) =>
              s.file.includes('beforeload-server-leak') ||
              s.file.includes('beforeload-leak'),
          )),
    )

    expect(hits.length).toBeGreaterThanOrEqual(1)

    if (mode === 'build') {
      const specHit = hits.find(
        (v) =>
          v.type === 'specifier' &&
          v.specifier === '@tanstack/react-start/server',
      )
      expect(specHit).toBeDefined()
    }
  })
}

test('beforeload-leak: violation trace includes the route file', async () => {
  const violations = await readViolations('build')

  const hit = violations.find(
    (v) =>
      v.envType === 'client' &&
      v.type === 'specifier' &&
      v.specifier === '@tanstack/react-start/server' &&
      (v.importer.includes('beforeload-server-leak') ||
        v.trace.some((s) => s.file.includes('beforeload-server-leak'))),
  )

  expect(hit).toBeDefined()
  expect(hit!.trace.length).toBeGreaterThanOrEqual(2)

  // The trace should include beforeload-leak route somewhere in the chain
  const traceFiles = hit!.trace.map((s) => s.file).join(' -> ')
  expect(traceFiles).toContain('beforeload-leak')
})

// Warm-start regression tests: second navigation (cached modules) must
// still produce the same violations as the cold run.

test('warm run produces violations', async () => {
  const warm = await readViolations('dev.warm')
  expect(warm.length).toBeGreaterThan(0)
})

test('warm run detects the same unique violations as cold run', async () => {
  const cold = await readViolations('dev.cold')
  const warm = await readViolations('dev.warm')

  // Deduplicate by (envType, type, specifier, importer-file) since the same
  // logical violation can be reported multiple times via different code paths.
  const uniqueKey = (v: Violation) =>
    `${v.envType}|${v.type}|${v.specifier}|${v.importer.replace(/:.*/, '')}`

  const coldUniq = [...new Set(cold.map(uniqueKey))].sort()
  const warmUniq = [...new Set(warm.map(uniqueKey))].sort()
  expect(warmUniq).toEqual(coldUniq)
})

test('warm run traces include line numbers', async () => {
  const warm = await readViolations('dev.warm')

  const v = warm.find((x) => x.type === 'file' && x.trace.length >= 3)
  expect(v).toBeDefined()

  for (let i = 1; i < v!.trace.length; i++) {
    const step = v!.trace[i]
    if (step.specifier?.includes('?tsr-split=')) continue
    if (step.file.includes('routeTree.gen')) continue
    const prev = v!.trace[i - 1]
    if (prev?.specifier?.includes('?tsr-split=')) continue

    expect(
      step.line,
      `warm trace step ${i} (${step.file}) should have a line number`,
    ).toBeDefined()
    expect(step.line).toBeGreaterThan(0)
  }
})
