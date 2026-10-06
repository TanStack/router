import { describe, expect, test } from 'vitest'
import {
  compileWithRscCssTransform,
  getModuleErrors,
} from './regression-helpers'

const optionsCount = (code: string) =>
  code.match(/__tanstackStartRscCss:\s*import\.meta\.viteRsc\.loadCss\(\)/g)
    ?.length ?? 0
const fragmentCount = (code: string) =>
  code.match(/<>\{import\.meta\.viteRsc\.loadCss\(\)\}/g)?.length ?? 0

describe('RSC CSS compiler transforms: import and argument shapes', () => {
  test('aliased, namespace and @tanstack/react-start-rsc imports are rewritten', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderServerComponent as render, renderToReadableStream as toStream } from '@tanstack/react-start/rsc'
      import * as RSC from '@tanstack/react-start/rsc'
      import { createCompositeComponent } from '@tanstack/react-start-rsc'

      export const a = render(<Card />)
      export const b = RSC.renderServerComponent(<Card />)
      export const c = createCompositeComponent(() => ({ Card: <Card /> }))
      export const d = toStream(<Card />)
      export const e = RSC.renderToReadableStream(<><Card /></>)
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(optionsCount(code!)).toBe(3)
    expect(fragmentCount(code!)).toBe(2)
  })

  test('renderToReadableStream unwraps transparent wrappers around JSX only', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderToReadableStream } from '@tanstack/react-start/rsc'

      const element = <Card />
      export const wrapped = [
        renderToReadableStream((<Card />)),
        renderToReadableStream(<Card /> as any),
        renderToReadableStream(<Card />!),
        renderToReadableStream((<><Card /></>) satisfies unknown),
      ]
      export const untouched = [
        renderToReadableStream(element),
        renderToReadableStream(flag ? <A /> : <B />),
        renderToReadableStream(...args),
      ]
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(fragmentCount(code!)).toBe(4)
    expect(code).toContain('renderToReadableStream(element)')
    expect(code).toContain('renderToReadableStream(...args)')
    expect(code).not.toMatch(/as any|satisfies unknown|\/>!/)
  })

  test('calls with extra arguments and shadowed names are left alone', async () => {
    const code = await compileWithRscCssTransform(`
      import { renderServerComponent } from '@tanstack/react-start/rsc'

      export const configured = renderServerComponent(<Card />, { existing: true })
      export function local(renderServerComponent) {
        return renderServerComponent(<Card />)
      }
      export const transformed = renderServerComponent(<Card />)
    `)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    expect(optionsCount(code!)).toBe(1)
    // Existing options are not followed by a second options object.
    expect(code).toMatch(/existing: true\s*\}\)/)
  })
})
