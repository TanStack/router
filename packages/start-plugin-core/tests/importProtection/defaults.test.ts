import { describe, expect, test } from 'vitest'
import {
  getDefaultImportProtectionRules,
  getMarkerSpecifiers,
} from '../../src/import-protection-plugin/defaults'

describe('getDefaultImportProtectionRules', () => {
  test('returns client rules for react', () => {
    const rules = getDefaultImportProtectionRules('react')

    expect(rules.client.specifiers).toEqual(
      expect.arrayContaining([
        '@tanstack/react-start/server',
        '@tanstack/solid-start/server',
        '@tanstack/vue-start/server',
      ]),
    )

    expect(rules.client.files).toEqual(
      expect.arrayContaining(['**/*.server.*', '**/.server/**']),
    )
  })

  test('returns server rules for react', () => {
    const rules = getDefaultImportProtectionRules('react')

    expect(rules.server.specifiers).toEqual([])

    expect(rules.server.files).toEqual(
      expect.arrayContaining(['**/*.client.*', '**/.client/**']),
    )
  })

  test('works for all frameworks', () => {
    for (const fw of ['react', 'solid', 'vue'] as const) {
      const rules = getDefaultImportProtectionRules(fw)
      expect(rules.client.specifiers.length).toBeGreaterThan(0)
      expect(rules.client.files.length).toBeGreaterThan(0)
      expect(rules.server.files.length).toBeGreaterThan(0)
    }
  })
})

describe('getMarkerSpecifiers', () => {
  test('returns server-only and client-only markers for react', () => {
    const markers = getMarkerSpecifiers('react')

    expect(markers.serverOnly).toContain(
      '@tanstack/react-start/server-only',
    )
    expect(markers.clientOnly).toContain(
      '@tanstack/react-start/client-only',
    )
  })

  test('includes all frameworks', () => {
    const markers = getMarkerSpecifiers('react')

    expect(markers.serverOnly.length).toBe(3)
    expect(markers.clientOnly.length).toBe(3)

    expect(markers.serverOnly).toContain(
      '@tanstack/solid-start/server-only',
    )
    expect(markers.clientOnly).toContain(
      '@tanstack/vue-start/client-only',
    )
  })
})
