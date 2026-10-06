import { describe, expect, it } from 'vitest'
import { compileRouteModules } from './regression-helpers'

/** Split chunks (and the shared module) that contain JSX. */
function jsxChunks(code: string) {
  const { modules } = compileRouteModules(code)
  return Object.entries(modules).filter(
    ([name, chunk]) => name !== 'reference' && /<[A-Za-z]/.test(chunk),
  )
}

// JSX pragmas apply per module: the bundler's JSX transform runs on each split
// chunk separately, so a chunk without the pragma compiles its JSX with the
// project default runtime (e.g. `css` props are no longer handled by Emotion).
describe('code-splitter keeps JSX pragmas in split chunks', () => {
  it.each([
    [
      '@jsxImportSource on the first import',
      `/** @jsxImportSource @emotion/react */\nimport { createFileRoute } from '@tanstack/react-router'\n`,
    ],
    [
      '@jsxImportSource line comment',
      `// @jsxImportSource @emotion/react\nimport { createFileRoute } from '@tanstack/react-router'\n`,
    ],
    [
      '@jsxImportSource inside a file header',
      `/**\n * Header\n * @jsxImportSource @emotion/react\n */\nimport { createFileRoute } from '@tanstack/react-router'\n`,
    ],
    [
      '@jsxImportSource after the imports',
      `import { createFileRoute } from '@tanstack/react-router'\n/** @jsxImportSource @emotion/react */\n`,
    ],
  ])('keeps %s', (_, header) => {
    const code = `${header}export const Route = createFileRoute('/pragma')({
  component: () => <div css={{ color: 'red' }}>styled</div>,
  errorComponent: () => <p css={{ color: 'blue' }}>error</p>,
})
`
    const chunks = jsxChunks(code)
    expect(chunks.length).toBeGreaterThan(0)
    for (const [name, chunk] of chunks) {
      expect({ name, chunk }).toEqual({
        name,
        chunk: expect.stringContaining('@jsxImportSource @emotion/react'),
      })
    }
  })

  it('keeps @jsxRuntime classic and @jsx pragmas', () => {
    const code = `/** @jsxRuntime classic */
/** @jsx jsx */
import { createFileRoute } from '@tanstack/react-router'
import { jsx } from '@emotion/react'
export const Route = createFileRoute('/pragma')({
  component: () => <div css={{ color: 'red' }}>styled</div>,
})
`
    const chunks = jsxChunks(code)
    expect(chunks.length).toBeGreaterThan(0)
    for (const [, chunk] of chunks) {
      expect(chunk).toContain('@jsxRuntime classic')
      expect(chunk).toContain('@jsx jsx')
    }
  })

  it('keeps the pragma in a shared module that contains JSX', () => {
    const code = `/** @jsxImportSource @emotion/react */
import { createFileRoute } from '@tanstack/react-router'
const icon = <svg css={{ width: 1 }} />
export const Route = createFileRoute('/pragma')({
  loader: () => ({ icon }),
  component: () => <div css={{ color: 'red' }}>{icon}</div>,
})
`
    const { shared } = compileRouteModules(code).modules
    expect(shared).toContain('<svg')
    expect(shared).toContain('@jsxImportSource @emotion/react')
  })
})
