import { describe, expect, it } from 'vitest'
import { maskOctaneRouteSource } from '../src/generator-plugin'

describe('maskOctaneRouteSource', () => {
  it('passes plain TypeScript server routes through unchanged', () => {
    const source = `import { createFileRoute } from '@tanstack/octane-router'

export const Route = createFileRoute('/rss[.]xml')({
  server: {
    handlers: {
      GET: async () => new Response('<rss />'),
    },
  },
})
`

    expect(maskOctaneRouteSource(source, '/routes/rss[.]xml.ts')).toBe(source)
  })

  it('preserves offsets while masking Octane component templates', () => {
    const source = `import { createFileRoute } from '@tanstack/octane-router'

export const Route = createFileRoute('/wrong')({ component: Page })

function Page() @{
  const value = \`value: \${JSON.stringify({ nested: true })}\`
  @if (/\\}/.test(value)) {
    <div>{value as string}</div>
  }
}
`

    const masked = maskOctaneRouteSource(source, '/routes/index.tsrx')

    expect(masked).toHaveLength(source.length)
    expect(masked.indexOf("createFileRoute('/wrong')")).toBe(
      source.indexOf("createFileRoute('/wrong')"),
    )
    expect(masked).toContain('function Page()  {')
    expect(masked).not.toContain('@if')
    expect(masked.split('\n')).toHaveLength(source.split('\n').length)
  })

  it('does not mask lookalikes in comments or strings', () => {
    const source = `const string = '@{ untouched }'
// @{ untouched }
/* @{ untouched } */
export const Route = createFileRoute('/')({})
`

    expect(maskOctaneRouteSource(source)).toBe(source)
  })

  it('rejects an unterminated template', () => {
    expect(() => maskOctaneRouteSource('function Page() @{ <div />')).toThrow()
  })
})
