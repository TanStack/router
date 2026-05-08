import { describe, expect, test } from 'vitest'
import {
  clientEntryScriptFilter,
  isClientEntryScript,
  stripClientEntryImport,
} from '../src/clientEntryScript'
import type { RouterManagedTag } from '@tanstack/router-core'

describe('isClientEntryScript', () => {
  test('returns true when data-tsr-client-entry attr is set', () => {
    expect(
      isClientEntryScript({
        tag: 'script',
        attrs: { 'data-tsr-client-entry': 'true' },
      } as RouterManagedTag),
    ).toBe(true)
  })

  test('returns true when children include the legacy virtual id', () => {
    expect(
      isClientEntryScript({
        tag: 'script',
        children: 'import("virtual:tanstack-start-client-entry")',
      } as RouterManagedTag),
    ).toBe(true)
  })

  test('returns false for non-script tags', () => {
    expect(
      isClientEntryScript({
        tag: 'link',
        attrs: { 'data-tsr-client-entry': 'true' },
      } as RouterManagedTag),
    ).toBe(false)
  })

  test('returns false for unmarked scripts', () => {
    expect(
      isClientEntryScript({
        tag: 'script',
        children: 'console.log("hello")',
      } as RouterManagedTag),
    ).toBe(false)
  })
})

describe('stripClientEntryImport', () => {
  test('strips trailing import() from a marked client-entry script, keeps prelude', () => {
    const result = stripClientEntryImport({
      tag: 'script',
      attrs: { 'data-tsr-client-entry': 'true' },
      children:
        'window.__tsr_refresh_setup = true;\nimport("/assets/client.js")',
    } as RouterManagedTag)
    expect(result).not.toBeNull()
    expect((result as RouterManagedTag).children).toBe(
      'window.__tsr_refresh_setup = true',
    )
  })

  test('returns null when nothing remains after stripping', () => {
    const result = stripClientEntryImport({
      tag: 'script',
      attrs: { 'data-tsr-client-entry': 'true' },
      children: 'import("/assets/client.js")',
    } as RouterManagedTag)
    expect(result).toBeNull()
  })

  test('strips legacy virtual id substring', () => {
    const result = stripClientEntryImport({
      tag: 'script',
      children:
        'window.x = 1\nimport("virtual:tanstack-start-client-entry")',
    } as RouterManagedTag)
    expect(result).not.toBeNull()
    expect((result as RouterManagedTag).children).toBe('window.x = 1')
  })

  test('returns the script unchanged when not a client-entry script', () => {
    const script = {
      tag: 'script',
      children: 'console.log("hello")',
    } as RouterManagedTag
    expect(stripClientEntryImport(script)).toBe(script)
  })
})

describe('clientEntryScriptFilter', () => {
  test('passes through scripts when shouldHydrate is true', () => {
    const script = {
      tag: 'script',
      attrs: { 'data-tsr-client-entry': 'true' },
      children: 'import("/assets/client.js")',
    } as RouterManagedTag
    expect(clientEntryScriptFilter(script, { shouldHydrate: true })).toBe(
      script,
    )
  })

  test('strips client-entry imports when shouldHydrate is false', () => {
    expect(
      clientEntryScriptFilter(
        {
          tag: 'script',
          attrs: { 'data-tsr-client-entry': 'true' },
          children: 'import("/assets/client.js")',
        } as RouterManagedTag,
        { shouldHydrate: false },
      ),
    ).toBeNull()
  })

  test('leaves unrelated scripts unchanged when shouldHydrate is false', () => {
    const script = {
      tag: 'script',
      children: 'console.log("hello")',
    } as RouterManagedTag
    expect(clientEntryScriptFilter(script, { shouldHydrate: false })).toBe(
      script,
    )
  })
})
