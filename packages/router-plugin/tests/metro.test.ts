import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withTanStackRouter } from '../src/metro'

describe('@tanstack/router-plugin/metro', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'tsr-metro-test-'))
    // Minimal tsr.config.json so getConfig has something to read
    writeFileSync(
      join(tmpRoot, 'tsr.config.json'),
      JSON.stringify({
        target: 'react',
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    )
    mkdirSync(join(tmpRoot, 'src', 'routes'), { recursive: true })
    // A single route so the generator has at least one to template
    writeFileSync(
      join(tmpRoot, 'src', 'routes', '__root.tsx'),
      "export const Route = { id: 'root' }\n",
    )
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns the metro config object reference unchanged', () => {
    const config = { resolver: {}, transformer: {} }
    const result = withTanStackRouter(config, {
      root: tmpRoot,
      // Skip generator + watcher for this assertion; we only care about
      // the function being a sync identity transform on the config arg.
      initialGenerate: false,
      watch: false,
    })
    expect(result).toBe(config)
  })

  it('runs initial route generation synchronously when enabled', () => {
    const config = { resolver: {} }
    const generatedTreePath = join(tmpRoot, 'src', 'routeTree.gen.ts')

    withTanStackRouter(config, {
      root: tmpRoot,
      watch: false,
      // initialGenerate defaults to true
    })

    // The route tree file must exist immediately after the call returns.
    // No awaiting — proves the wrapper is sync end-to-end.
    const tree = readFileSync(generatedTreePath, 'utf8')
    expect(tree).toMatch(/routeTree/)
  })

  it('skips generation when enableRouteGeneration is false', () => {
    const config = { resolver: {} }
    const generatedTreePath = join(tmpRoot, 'src', 'routeTree.gen.ts')

    const result = withTanStackRouter(config, {
      root: tmpRoot,
      config: { enableRouteGeneration: false },
      watch: false,
    })

    expect(result).toBe(config)
    // No tree should have been written
    expect(() => readFileSync(generatedTreePath, 'utf8')).toThrow()
  })

  it('skips initial generation when initialGenerate: false', () => {
    const config = { resolver: {} }
    const generatedTreePath = join(tmpRoot, 'src', 'routeTree.gen.ts')

    withTanStackRouter(config, {
      root: tmpRoot,
      initialGenerate: false,
      watch: false,
    })

    expect(() => readFileSync(generatedTreePath, 'utf8')).toThrow()
  })
})
