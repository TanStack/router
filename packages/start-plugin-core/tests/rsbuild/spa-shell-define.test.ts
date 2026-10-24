import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { tanStackStartRsbuild } from '../../src/rsbuild/plugin'
import type { TanStackStartRsbuildInputConfig } from '../../src/rsbuild/schema'

const root = mkdtempSync(join(tmpdir(), 'tss-rsbuild-shell-'))
mkdirSync(join(root, 'src'))
writeFileSync(join(root, 'src', 'router.tsx'), 'export {}')

afterAll(() => rmSync(root, { recursive: true, force: true }))

function resolveDefine(
  action: 'dev' | 'build',
  startPluginOpts: TanStackStartRsbuildInputConfig,
) {
  let modify: any
  const api = new Proxy(
    { context: { action }, modifyRsbuildConfig: (fn: any) => (modify = fn) },
    { get: (target, key) => (key in target ? (target as any)[key] : () => {}) },
  )
  tanStackStartRsbuild(
    {
      framework: 'react',
      defaultEntryPaths: { client: 'c', server: 's', start: 'st' },
    } as any, startPluginOpts).setup(
    api as any,
  )
  const result = modify(
    { root },
    { mergeRsbuildConfig: (...configs: Array<any>) => configs[1] },
  )
  return result.source.define as Record<string, string>
}

describe('rsbuild TSS_SHELL define', () => {
  test('is true in dev when spa is enabled', () => {
    const define = resolveDefine('dev', { spa: { enabled: true } })

    expect(define['process.env.TSS_SHELL']).toBe('"true"')
    expect(define['import.meta.env.TSS_SHELL']).toBe('"true"')
  })

  test('is false in dev when spa is not enabled', () => {
    const define = resolveDefine('dev', {})

    expect(define['process.env.TSS_SHELL']).toBe('"false"')
    expect(define['import.meta.env.TSS_SHELL']).toBe('"false"')
  })

  test('is not defined in build', () => {
    const define = resolveDefine('build', { spa: { enabled: true } })

    expect(define).not.toHaveProperty('process.env.TSS_SHELL')
  })
})
