/**
 * Controls of the paired-build oracle (added-code.ts) on fixed chunks:
 * private renaming, printing and placement differences add nothing; a
 * statement made only of names the bundle already has is added.
 */
import { describe, expect, test } from 'vitest'
import { addedCode } from '../src/added-code'

const build = (chunks: Record<string, string>) => ({
  chunks: Object.entries(chunks).map(([fileName, code]) => ({
    fileName,
    code,
  })),
})

const control = build({
  'entry-Ab12Cd34.js': `function helper(value) {
  console.warn('[route] ' + value)
  return value * 2
}
export function render(input) {
  const doubled = helper(input)
  return import('./lazy-Ef56Gh78.js').then((m) => m.show(doubled))
}
`,
  'lazy-Ef56Gh78.js': `export const show = (value) => ({ text: "MARK " + value })\n`,
})

describe('addedCode', () => {
  test('the same code with other private names, another printing and other chunk hashes adds nothing', () => {
    const renamed = build({
      'entry-Zz99Yy88.js': `function h(v){console.warn("[route] "+v);return (v*2)}
export function render(i){const d=h(i);return import("./lazy-Qq11Rr22.js").then(n=>n.show(d))}`,
      'lazy-Qq11Rr22.js': `export const show = v => ({ text: 'MARK ' + v })`,
    })
    expect(addedCode(renamed, control)).toEqual([])
  })

  test('code moved to another chunk adds nothing', () => {
    const moved = build({
      'entry-Ab12Cd34.js': `export function render(input) {
  const doubled = helper(input)
  return import('./lazy-Ef56Gh78.js').then((m) => m.show(doubled))
}
import { helper } from './shared-Ij90Kl12.js'
`,
      'shared-Ij90Kl12.js': `export function helper(value) {
  console.warn('[route] ' + value)
  return value * 2
}
`,
      'lazy-Ef56Gh78.js': `export const show = (value) => ({ text: "MARK " + value })\n`,
    })
    // The imports and exports linking the chunks are placement.
    expect(addedCode(moved, control)).toEqual([])
  })

  test('a development-only call made of names the bundle already has is added', () => {
    const withDiagnostic = build({
      'entry-Ab12Cd34.js': `function helper(value) {
  console.warn('[route] ' + value)
  return value * 2
}
export function render(input) {
  const doubled = helper(input)
  console.warn('[route] ' + doubled)
  return import('./lazy-Ef56Gh78.js').then((m) => m.show(doubled))
}
`,
      'lazy-Ef56Gh78.js': `export const show = (value) => ({ text: "MARK " + value })\n`,
    })
    expect(addedCode(withDiagnostic, control)).toEqual([
      { chunk: 'entry-Ab12Cd34.js', code: `console.warn('[route] ' + doubled)` },
    ])
  })

  test('a changed global, property or literal is added', () => {
    const variants = [
      // Another global
      `export const read = () => window.location.href`,
      // Another property
      `export const read = () => document.location.hash`,
      // Another string
      `export const read = () => document.location.href + '!'`,
    ]
    const base = build({
      'entry.js': `export const read = () => document.location.href`,
    })
    for (const code of variants) {
      expect(addedCode(build({ 'entry.js': code }), base), code).toHaveLength(
        1,
      )
    }
  })
})
