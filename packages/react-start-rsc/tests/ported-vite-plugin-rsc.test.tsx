/**
 * Scope edge cases ported from the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT). The
 * RSC CSS transforms only rewrite calls whose callee resolves to the imported
 * render API; each test names the plugin-rsc fixture whose scoping rule it
 * exercises.
 */
import { expect, test } from 'vitest'
import {
  compileWithRscCssTransform,
  getModuleErrors,
} from './regression-helpers'

const css =
  /\{\s*__tanstackStartRscCss:\s*import\.meta\.viteRsc\.loadCss\(\)\s*\}/

test.each([
  {
    // hoist/function-hoist-block.js: block-level functions are block scoped
    name: 'past a function declared in a nested block',
    body: `{
    function renderServerComponent() {}
  }
  return renderServerComponent(<Card />)`,
    transformed: true,
  },
  {
    // scope/param-default-var-hoisting.js
    name: 'in a parameter default next to a var of the same name',
    params: `element = renderServerComponent(<Card />)`,
    body: `var renderServerComponent = null
  return element`,
    transformed: true,
  },
  {
    // hoist/catch-binding-shadow.js
    name: 'in a try block whose catch parameter shadows it',
    body: `try {
    return renderServerComponent(<Card />)
  } catch (renderServerComponent) {
    return renderServerComponent
  }`,
    transformed: true,
  },
  {
    // scope/label.js
    name: 'next to a label of the same name',
    body: `renderServerComponent: {
    break renderServerComponent
  }
  return renderServerComponent(<Card />)`,
    transformed: true,
  },
  {
    // hoist/var-hoist-block.js
    name: 'after a var in a nested block shadows it',
    body: `if (Math.random() < 2) {
    var renderServerComponent = (element) => element
  }
  return renderServerComponent(<Card />)`,
    transformed: false,
  },
  {
    // scope/fn-decl-hoisting.js
    name: 'before a hoisted function declaration shadows it',
    body: `return renderServerComponent(<Card />)
  function renderServerComponent(element) {
    return element
  }`,
    transformed: false,
  },
  {
    // scope/catch-param.js
    name: 'in a catch block whose parameter shadows it',
    body: `try {
    throw (element) => element
  } catch (renderServerComponent) {
    return renderServerComponent(<Card />)
  }`,
    transformed: false,
  },
])(
  'a render call $name is rewritten only when it reads the import',
  async ({ params = '', body, transformed }) => {
    const code = await compileWithRscCssTransform(`
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const marker = renderServerComponent(<Card />)
export function render(${params}) {
  ${body}
}
`)
    expect(code).not.toBeNull()
    expect(await getModuleErrors(code!)).toEqual([])
    const renderFunction = code!.slice(code!.indexOf('function render('))
    expect(renderFunction).toMatch(
      transformed ? css : /^(?![\s\S]*__tanstackStartRscCss)/,
    )
  },
)
