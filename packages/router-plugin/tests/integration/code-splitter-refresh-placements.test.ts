// Where a route file holds a React `/* @refresh reset */` comment, on Rsbuild
// (`@rsbuild/plugin-react`, whose SWC reads a comment leading its line or
// after the file's last token, outside TypeScript types): an edit of the
// split route resets the count the click set exactly where the unsplit route
// does (SPEC J2.16). The comment's statement stays where the compiler puts it
// and runs once (route-hmr-browser-refresh-comments.test.ts); the chunk holds
// a copy of the comment alone. More placements: code-splitter-pragmas.test.ts.
// Placements that differ, accepted (oracle/KNOWN-BUGS.md, "Accepted limits"):
// a comment inside syntax TypeScript erases within a value statement, and one
// trailing or inside an expression statement.
import { expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 120_000

interface Comments {
  name: string
  header?: string
  aboveRoute?: string
  jsx?: string
  /** Inside the route's options, before `component`. */
  inOptions?: string
}

const counter = (
  { header = '', aboveRoute = '', jsx = '', inOptions = '' }: Comments,
  version: string,
) => `${header}import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>
      ${jsx}Counter {'${version}'} count {count}
    </button>
  )
}
${aboveRoute}export const Route = createFileRoute('/')({
${inOptions}  component: Page,
})
`

/** Opens the app, clicks the counter once, edits the route and returns what the counter shows then. */
async function counterAfterEdit(
  autoCodeSplitting: boolean,
  comments: Comments,
) {
  const app = await openRouteHmrPage({
    bundler: 'rsbuild',
    pluginOptions: { autoCodeSplitting },
    files: { 'routes/index.tsx': counter(comments, 'v1') },
    ready: 'Counter v1 count 0',
  })
  await app.click('button')
  await app.page.waitForText('Counter v1 count 1')
  await app.edit(
    { 'routes/index.tsx': counter(comments, 'v2') },
    /Counter v2 count \d/,
  )
  return /Counter v2 count \d/.exec(await app.page.text())?.[0]
}

const rows: Array<Comments> = [
  // (review of the implementation, Fable 4: SWC drops the comment with the
  // erased import in the file)
  {
    name: 'a file header above a type-only import (block comment)',
    header: "/* @refresh reset */\nimport type { ReactNode } from 'react'\n",
  },
  {
    name: 'a file header above a type-only import (line comment)',
    header: "// @refresh reset\nimport type { ReactNode } from 'react'\n",
  },
  {
    name: 'leading its line inside the route options',
    inOptions: '  /* @refresh reset */\n',
  },
  {
    name: 'a file header above an expression statement (block comment)',
    header: "/* @refresh reset */\nconsole.log('init')\n",
  },
  {
    name: 'a file header above an expression statement (line comment)',
    header: "// @refresh reset\nconsole.log('init')\n",
  },
  {
    name: 'leading its line above an export, then above a type alias',
    aboveRoute:
      '/* @refresh reset */\nexport const meta = 1\n/* @refresh reset */\ntype T = string\n',
  },
  {
    name: 'leading its line above a type alias',
    aboveRoute: '/* @refresh reset */\ntype T = string\n',
  },
  {
    name: 'leading its line above an unread declaration',
    aboveRoute: '/* @refresh reset */\nconst unused = Math.random()\n',
  },
  {
    name: 'trailing a declaration',
    aboveRoute: 'const sample = 1 /* @refresh reset */\n',
  },
  {
    name: 'inside a type alias, leading its line',
    aboveRoute: 'type Sample =\n /* @refresh reset */\n number\n',
  },
  {
    name: 'inside a type literal, before a member',
    aboveRoute: 'type T = {\n /* @refresh reset */ n: number\n}\n',
  },
  {
    name: 'between JSX braces, leading its line',
    jsx: '{\n  /* @refresh reset */\n}',
  },
  {
    name: 'in a function that only holds it',
    aboveRoute: 'function empty(){\n /* @refresh reset */\n}\n',
  },
  {
    name: 'before the closing brace of an object',
    aboveRoute: 'const sample = { value: 1\n /* @refresh reset */\n}\n',
  },
  {
    name: 'after a multi-line comment that follows a token',
    aboveRoute: 'const a = 1 /* trailing\n */ /* @refresh reset */\n',
  },
  {
    name: 'leading its line above an ambient declaration',
    aboveRoute: '/* @refresh reset */\ndeclare const a: number\n',
  },
  {
    name: 'inside a declared class field',
    aboveRoute: 'class A { declare\n /* @refresh reset */\n value: number }\n',
  },
  {
    name: 'inside a type-only import',
    aboveRoute:
      "import type {\n /* @refresh reset */\n ReactNode } from 'react'\n",
  },
  {
    name: 'before a member access',
    aboveRoute: 'const a = Math /* @refresh reset */ .PI\n',
  },
  {
    name: 'in a helper component, inside JSX',
    aboveRoute:
      'function Another() { return <span>{/* @refresh reset */}</span> }\n',
  },
]

test.each(rows)(
  'with the comment $name, an edit of the split route shows what it shows unsplit',
  async (comments) => {
    const [unsplit, split] = await Promise.all([
      counterAfterEdit(false, comments),
      counterAfterEdit(true, comments),
    ])
    expect(unsplit).toMatch(/Counter v2 count \d/)
    expect(split).toBe(unsplit)
  },
  timeout,
)
