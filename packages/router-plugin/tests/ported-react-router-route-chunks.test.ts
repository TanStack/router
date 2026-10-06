/**
 * Scenarios ported from React Router's route-chunk and export-removal tests
 * (remix-run/react-router `packages/react-router-dev/vite/route-chunks-test.ts`
 * and `remove-exports-test.ts`, MIT). React Router moves `clientLoader` and
 * friends into their own chunks; here route options moved into split chunks
 * play the chunked exports and the reference module plays the main chunk.
 */
import { describe, expect, it } from 'vitest'
import { compileCodeSplitVirtualRoute } from '../src/core/code-splitter/compilers'
import { compileRouteModules, expectValidModules } from './regression-helpers'
import { declarationOf } from './validate-module'

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/** Decodes source map mappings into `[column, source, line, column, name]` segments. */
function decodeMappings(mappings: string) {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const state = [0, 0, 0, 0, 0]
  return mappings.split(';').map((line) => {
    state[0] = 0
    return line
      .split(',')
      .filter(Boolean)
      .map((segment) => {
        let value = 0
        let shift = 0
        let index = 0
        for (const char of segment) {
          const digit = alphabet.indexOf(char)
          value += (digit & 31) << shift
          if (digit & 32) {
            shift += 5
            continue
          }
          state[index] =
            state[index]! + (value & 1 ? -(value >>> 1) : value >>> 1)
          index++
          value = 0
          shift = 0
        }
        return state.slice(0, index)
      })
  })
}

describe('ported React Router route chunks: imports', () => {
  // Source: route-chunks-test.ts "functions referencing their own identifiers"
  it('gives each chunk only the default, named or namespace import it uses', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import defaultMessage, {
  targetMessage1,
  otherMessage1,
} from './messages'
import * as messages from './messages'
const getDefaultMessage = () => defaultMessage
const getTargetMessage1 = () => targetMessage1
const getOtherMessage1 = () => otherMessage1
function getNamespacedMessage() {
  return messages.namespacedMessage
}
export const Route = createFileRoute('/')({
  loader: () => getOtherMessage1(),
  component: () => <div>{getDefaultMessage()}</div>,
  errorComponent: () => <div>{getNamespacedMessage()}</div>,
  notFoundComponent: () => <div>{getTargetMessage1()}</div>,
})
`)
    expect(sharedBindings).toEqual([])
    const imports = (code: string) =>
      code.match(/^import .* from ['"]\.\/messages['"];?$/gm)
    expect(imports(modules.reference!)).toEqual([
      expect.stringMatching(/^import \{ otherMessage1 \} from/),
    ])
    expect(imports(modules['virtual component']!)).toEqual([
      expect.stringMatching(/^import defaultMessage from/),
    ])
    expect(imports(modules['virtual errorComponent']!)).toEqual([
      expect.stringMatching(/^import \* as messages from/),
    ])
    expect(imports(modules['virtual notFoundComponent']!)).toEqual([
      expect.stringMatching(/^import \{ targetMessage1 \} from/),
    ])
    expect(modules['virtual component']).toMatch(
      declarationOf('getDefaultMessage'),
    )
    expect(modules['virtual errorComponent']).toMatch(
      declarationOf('getNamespacedMessage'),
    )
    expect(modules['virtual notFoundComponent']).toMatch(
      declarationOf('getTargetMessage1'),
    )
    await expectValidModules(modules)
  })

  // Source: route-chunks-test.ts "shared imports across chunks but not main chunk"
  it('keeps an import that only split chunks use out of the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}import { shared } from './shared'
export const Route = createFileRoute('/')({
  loader: () => 'main',
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`)
    expect(modules.reference).not.toContain('./shared')
    expect(modules['virtual component']).toContain('./shared')
    expect(modules['virtual errorComponent']).toContain('./shared')
    await expectValidModules(modules)
  })

  // Source: route-chunks-test.ts "import with side effect usage" and "shared
  // imports across chunks but not main chunk with shared side effect usage"
  it.each([
    {
      name: 'an import only the side effect uses',
      code: `${head}import { sideEffect } from './side-effect'
sideEffect()
export const Route = createFileRoute('/')({
  component: () => <div>chunk</div>,
})
`,
      call: 'sideEffect()',
    },
    {
      name: 'an import the split chunks use too',
      code: `${head}import { shared } from './shared'
shared('side-effect')
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`,
      call: `shared('side-effect')`,
    },
  ])(
    'runs a top-level call on $name only in the reference module',
    async ({ code, call }) => {
      const { modules } = compileRouteModules(code)
      expect(modules.reference).toContain(call)
      expect(modules['virtual component']).not.toContain(call)
      expect(modules['virtual errorComponent']).not.toContain(call)
      await expectValidModules(modules)
    },
  )
})

describe('ported React Router route chunks: declarations', () => {
  // Source: route-chunks-test.ts "isolated exported ... variable declarations
  // sharing an export statement" (plain, destructured and nested spread)
  it.each([
    {
      // Also Next.js ssg/getStaticProps/should-remove-re-exported-variable-declarations-safe
      name: 'plain declarators',
      declarations: `const Page = () => <div>{chunkMessage}</div>,
  ErrorView = () => <div>error</div>,
  main = mainMessage`,
      component: 'Page',
      errorComponent: 'ErrorView',
      kept: /const main = mainMessage;/,
      moved: 'Page',
    },
    {
      name: 'destructured declarators',
      declarations: `const { Page } = { Page: () => <div>{chunkMessage}</div> },
  { ErrorView } = { ErrorView: () => <div>error</div> },
  { main } = { main: mainMessage }`,
      component: 'Page',
      errorComponent: 'ErrorView',
    },
    {
      name: 'nested rest declarators',
      declarations: `const [, { nested: { ...chunk } }] = [null, { nested: { ...chunkMessage } }],
  [, { nested: { ...main } }] = [null, { nested: { ...mainMessage } }]`,
      component: '() => <div>{Object.keys(chunk).join()}</div>',
      errorComponent: '() => <div>error</div>',
    },
  ])(
    'moves $name sharing a statement into their own modules',
    async ({ declarations, component, errorComponent, kept, moved }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: ${component},
  errorComponent: ${errorComponent},
})
`)
      expect(sharedBindings).toEqual([])
      expect(modules.reference).toContain('mainMessage')
      expect(modules.reference).not.toContain('chunkMessage')
      expect(modules['virtual component']).toContain('chunkMessage')
      expect(modules['virtual component']).not.toContain('mainMessage')
      expect(modules['virtual errorComponent']).not.toContain('Message')
      if (kept) {
        expect(modules.reference).toMatch(kept)
      }
      if (moved) {
        expect(modules.reference).not.toMatch(declarationOf(moved))
        expect(modules['virtual component']).toMatch(declarationOf(moved))
      }
      await expectValidModules(modules)
    },
  )

  // Source: route-chunks-test.ts "exported variable declarations sharing an
  // export statement"
  it('shares a declarator that a sibling declarator reads', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { sharedMessage } from './messages'
const Page = () => <div>{sharedMessage}</div>,
  Preview = Page
export const Route = createFileRoute('/')({
  loader: () => Preview.name,
  component: Page,
})
`)
    expect(sharedBindings).toEqual(['Page'])
    expect(modules.shared).toMatch(declarationOf('Page'))
    expect(modules.reference).toMatch(/const Preview = Page;/)
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(modules['virtual component']).not.toMatch(declarationOf('Page'))
    await expectValidModules(modules)
  })

  // Source: route-chunks-test.ts "exported destructured object (spread)
  // variable declarations sharing an assignment"
  it.each([
    {
      name: 'an object destructuring',
      declaration: `const { Page, main } = { Page: () => <div>{chunkMessage}</div>, main: mainMessage }`,
      component: 'Page',
      shared: ['Page', 'main'],
    },
    {
      name: 'a nested object rest destructuring',
      declaration: `const {
  chunkMessage: { ...chunk },
  mainMessage: { ...main },
} = {
  chunkMessage: { ...chunkMessage },
  mainMessage: { ...mainMessage },
}`,
      component: '() => <div>{Object.keys(chunk).join()}</div>',
      shared: ['chunk', 'main'],
    },
  ])(
    'initializes $name whose bindings go to different groups once',
    async ({ declaration, component, shared }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: ${component},
})
`)
      expect(sharedBindings).toEqual(shared)
      expect(modules.shared).toContain('mainMessage')
      for (const name of ['reference', 'virtual component']) {
        expect(modules[name]).not.toContain('./messages')
        expect(modules[name]).toContain('tsr-shared=1')
      }
      await expectValidModules(modules)
    },
  )

  // Source: route-chunks-test.ts "circular dependencies between exports"
  it('shares mutually recursive helpers that the loader and the component call', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}const getChunkMessage = (recurse = true): string => {
  return 'chunk ' + (recurse ? getMainMessage(false) : '')
}
const getMainMessage = (recurse = true): string => {
  return 'main ' + (recurse ? getChunkMessage(false) : '')
}
export const Route = createFileRoute('/')({
  loader: () => getMainMessage(),
  component: () => <div>{getChunkMessage()}</div>,
})
`)
    expect(sharedBindings).toEqual(['getChunkMessage', 'getMainMessage'])
    expect(modules.shared).toMatch(declarationOf('getChunkMessage'))
    expect(modules.shared).toMatch(declarationOf('getMainMessage'))
    expect(modules.reference).not.toMatch(declarationOf('getChunkMessage'))
    expect(modules['virtual component']).not.toMatch(
      declarationOf('getMainMessage'),
    )
    await expectValidModules(modules)
  })
})

describe('ported React Router route chunks: export dependency analysis', () => {
  // Source: route-chunks-test.ts "if else", "try catch", "for...of with
  // destructuring and default value", "block", "default argument",
  // "destructured argument with default value", "generator function" and
  // "computed object property"
  it('attributes identifiers inside nested scopes to the split component', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { check } from './check'
import { chunkMessage1, chunkMessage2, errorMessage, messages, defaultMessage, keyName } from './messages'
import { mainMessage } from './main'
let getKey = () => keyName
let keyed = { [getKey()]: 'chunk' }
function* chunkGenerator() {
  yield chunkMessage1
  yield chunkMessage2
}
const getChunkMessage = (message = defaultMessage) => message.toUpperCase()
const getDestructured = ([{ defaultMessage: message }] = [{ defaultMessage }]) => message
function Page() {
  let out: Array<string> = []
  if (check()) {
    out.push(chunkMessage1)
  } else {
    out.push(chunkMessage2)
  }
  try {
    out.push(chunkMessage1)
  } catch (error) {
    out.push(errorMessage(error))
  }
  for (let { key, value = defaultMessage } of messages) {
    out.push(key, value)
  }
  {
    let messages = ['block']
    out.push(...messages)
  }
  out.push(getChunkMessage(), getDestructured(), ...chunkGenerator(), String(keyed))
  return <div>{out.join()}</div>
}
export const Route = createFileRoute('/')({
  loader: () => mainMessage,
  component: Page,
})
`)
    expect(sharedBindings).toEqual([])
    expect(modules.reference).not.toContain('./check')
    expect(modules.reference).not.toContain('./messages')
    expect(modules.reference).toContain('./main')
    const component = modules['virtual component']!
    expect(component).toMatch(/import \{ check \} from ['"]\.\/check['"]/)
    for (const name of [
      'chunkMessage1',
      'chunkMessage2',
      'errorMessage',
      'messages',
      'defaultMessage',
      'keyName',
    ]) {
      expect(component).toMatch(
        new RegExp(
          String.raw`import \{[^}]*\b${name}\b[^}]*\} from ['"]\./messages['"]`,
        ),
      )
    }
    for (const name of [
      'getKey',
      'keyed',
      'getChunkMessage',
      'getDestructured',
    ]) {
      expect(component).toMatch(declarationOf(name))
    }
    expect(component).toContain('function* chunkGenerator')
    expect(component).not.toContain('./main')
    await expectValidModules(modules)
  })

  // Source: route-chunks-test.ts "reassignment" and "function argument
  // reassignment"
  it('keeps a binding that only the split component reassigns in its chunk', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { reassignedMessage } from './messages'
let chunkMessage = 'chunk'
const getMessage = (message: string) => {
  message = chunkMessage
  return message
}
export const Route = createFileRoute('/')({
  loader: () => 'main',
  component: () => {
    chunkMessage = reassignedMessage
    return <div>{getMessage('')}</div>
  },
})
`)
    expect(sharedBindings).toEqual([])
    expect(modules.reference).not.toContain('chunkMessage')
    expect(modules.reference).not.toContain('./messages')
    expect(modules['virtual component']).toMatch(
      /let chunkMessage = ['"]chunk['"]/,
    )
    expect(modules['virtual component']).toMatch(declarationOf('getMessage'))
    await expectValidModules(modules)
  })

  // Source: route-chunks-test.ts "computed object property" and "class method
  // usage"
  it('treats computed keys as references and property names as plain keys', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { load } from './load'
const label = load()
const kind = 'kind'
export const Route = createFileRoute('/')({
  loader: () => [label, kind],
  component: () => {
    const obj = { label: 1, [kind]: 2 }
    class Local {
      label = 1
      kind() { return 2 }
    }
    outer: for (const x of [1]) { break outer }
    return <div>{obj.label}{new Local().label}</div>
  },
})
`)
    expect(sharedBindings).toEqual(['kind'])
    expect(modules['virtual component']).not.toContain('./load')
    expect(modules.reference).toMatch(declarationOf('label'))
    await expectValidModules(modules)
  })
})

describe('ported React Router export removal', () => {
  // Source: remove-exports-test.ts "arrow function with dependencies",
  // "function statement with dependencies", "function call with dependencies"
  // and "iife with dependencies"
  it.each([
    {
      name: 'an arrow function',
      helpers: `const sharedUtil = (value?: unknown) => sharedLib(value)
const removedUtil = () => sharedUtil(removedLib(REMOVED_STRING))
const keptUtil = () => sharedUtil(keptLib())
const Page = () => <div>{String(removedUtil())}</div>`,
    },
    {
      name: 'a function declaration',
      helpers: `function sharedUtil(value?: unknown) { return sharedLib(value) }
function removedUtil() { return sharedUtil(removedLib(REMOVED_STRING)) }
function keptUtil() { return sharedUtil(keptLib()) }
function Page() { return <div>{String(removedUtil())}</div> }`,
    },
    {
      name: 'a call result',
      helpers: `const sharedUtil = (value?: unknown) => sharedLib(value)
const removedUtil = () => sharedUtil(removedLib(REMOVED_STRING))
const keptUtil = () => sharedUtil(keptLib())
const Page = memo(() => <div>{String(removedUtil())}</div>)`,
    },
    {
      name: 'an IIFE result',
      helpers: `const sharedUtil = (value?: unknown) => sharedLib(value)
const removedUtil = () => sharedUtil(removedLib(REMOVED_STRING))
const keptUtil = () => sharedUtil(keptLib())
const Page = (() => {
  const message = removedUtil()
  return () => <div>{String(message)}</div>
})()`,
    },
  ])(
    'splits $name with its dependencies and shares the helper the loader uses too',
    async ({ helpers }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import { memo } from 'react'
import { removedLib } from 'removed-lib'
import { keptLib } from 'kept-lib'
import { sharedLib } from 'shared-lib'
const REMOVED_STRING = 'REMOVED_STRING'
${helpers}
export const Route = createFileRoute('/')({
  loader: () => keptUtil(),
  component: Page,
})
`)
      expect(sharedBindings).toEqual(['sharedUtil'])
      expect(modules.reference).not.toMatch(/removed/i)
      expect(modules.reference).toContain('kept-lib')
      expect(modules['virtual component']).not.toMatch(/kept/i)
      expect(modules['virtual component']).toMatch(declarationOf('Page'))
      expect(modules['virtual component']).toMatch(declarationOf('removedUtil'))
      expect(modules.shared).toContain('shared-lib')
      expect(modules.shared).not.toMatch(/removed|kept/i)
      await expectValidModules(modules)
    },
  )
})

describe('ported React Router route chunks: source maps', () => {
  // Source: route-chunks-test.ts "chunked export maps back to its line in the
  // route module"
  it('maps the split component back to its line in the route file', () => {
    const code = `${head}import { thing } from './thing'

export const Route = createFileRoute('/')({
  loader: () => thing,
  component: function RouteComponent() {
    return <div>{thing}</div>
  },
})
`
    const result = compileCodeSplitVirtualRoute({
      code,
      filename: `route.tsx?tsr-split=component`,
      splitTargets: ['component'],
    })
    const map = result.map as unknown as {
      sources: Array<string>
      sourcesContent: Array<string>
      mappings: string
    }
    expect(map.sourcesContent).toEqual([code])
    const outputLine = result.code
      .split('\n')
      .findIndex((line) => line.includes('return <div>{thing}</div>'))
    expect(outputLine).toBeGreaterThanOrEqual(0)
    const [segment] = decodeMappings(map.mappings)[outputLine]!
    // Line 7 (index 6) of the route file holds the returned JSX
    expect(segment?.[2]).toBe(6)
  })
})
