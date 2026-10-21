/**
 * Outside the compiler corpus: a control of the harness, not of a compiler
 * (SYNTHESIS B-other, known-bugs-code-splitter.test.ts :1803). A file that is
 * no route file, which no compiler of the router plugin touches, compiled by
 * the project's real JSX transform with a classic JSX pragma, renders its
 * JSX through the real Emotion factory the pragma names: client-rendered,
 * Emotion gives the element a generated class; JSX compiled with another
 * runtime leaves the `css` prop as a plain attribute. It shows that the
 * comparison of the pins in known-bugs-code-splitter-bindings.test.ts
 * ("classic JSX pragmas": a split component renders as the untouched file
 * does) means something. Those pins decide the compiler outcome.
 */
import { expect, test } from 'vitest'
import { head, loadRoute } from '../route-app'

const pragma = `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
`

/** Whether Emotion styled the element (client-rendered markup). */
const emotionStyled = (html: string) =>
  /class="css-/.test(html) && !/\bcss="/.test(html)

test.each([pragma, pragma.replace('@jsx jsx', '@jsx  jsx')])(
  'the untouched file renders JSX through the factory of a classic JSX pragma (%s)',
  async (header) => {
    const untouched = `${header}${head}export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
})`
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({ component: () => null })\n`,
      { files: { 'untouched.tsx': untouched }, prebundle: ['@emotion/react'] },
    )
    expect(
      emotionStyled(
        await route.run<string>(
          `return renderComponent((await app('untouched.tsx')).Route.options.component)`,
        ),
      ),
    ).toBe(true)
  },
)
