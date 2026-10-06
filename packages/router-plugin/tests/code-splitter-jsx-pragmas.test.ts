import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'

const filename = 'route.tsx'

/** Compiles every split chunk (and the shared module, if any) of a route file. */
function compileChunks(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const chunks: Record<string, string> = {}
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    chunks[split] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    chunks.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return chunks
}

/** Chunks that contain JSX and therefore need the file's JSX pragma. */
function jsxChunks(code: string) {
  return Object.entries(compileChunks(code)).filter(([, chunk]) =>
    /<[A-Za-z]/.test(chunk),
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
    const { shared } = compileChunks(code)
    expect(shared).toContain('<svg')
    expect(shared).toContain('@jsxImportSource @emotion/react')
  })
})
