/** Controls of the shared `expectOnlyOwnedEdits` helper (owned-edits.ts). */
import { describe, expect, test } from 'vitest'
import { expectOnlyOwnedEdits } from './owned-edits'

const before = `import { useState } from 'react'
import { Link, type LinkProps, createLazyFileRoute } from '@tanstack/react-router'

// keep me
export type Props = LinkProps
export const Route = createLazyFileRoute('/old')({
  component: () => [Link, useState],
})
`

describe('expectOnlyOwnedEdits', () => {
  test.each([
    {
      name: 'a new id, quoted otherwise',
      after: before.replace("'/old'", '"/new"'),
    },
    {
      name: 'the other constructor, imported on a line of its own',
      after: before
        .replace('createLazyFileRoute(', 'createFileRoute(')
        .replace(
          "import { useState } from 'react'\n",
          'import { useState } from \'react\'\nimport { createFileRoute } from "@tanstack/react-router";\n',
        ),
    },
    {
      name: 'the other constructor, in the same import',
      after: before
        .replace('createLazyFileRoute(', 'createFileRoute(')
        .replace('createLazyFileRoute }', 'createFileRoute }'),
    },
  ])('accepts $name', ({ after }) => {
    expectOnlyOwnedEdits(before, after)
  })

  test.each([
    {
      name: 'another import dropped',
      after: before.replace("import { useState } from 'react'\n", ''),
    },
    {
      name: 'another binding of the router import dropped',
      after: before.replace('Link, ', ''),
    },
    {
      name: 'a type binding turned into a value binding',
      after: before.replace('type LinkProps', 'LinkProps'),
    },
    {
      name: 'a comment changed',
      after: before.replace('// keep me', '// kept'),
    },
    {
      name: 'the line ending of another line changed',
      after: before.replace('// keep me\n', '// keep me\r\n'),
    },
    {
      name: 'a blank line left where the moved router import was',
      after:
        before.replace(
          "import { Link, type LinkProps, createLazyFileRoute } from '@tanstack/react-router'\n",
          '\n',
        ) +
        "import { Link, type LinkProps, createLazyFileRoute } from '@tanstack/react-router'\n",
    },
    {
      name: 'the options changed',
      after: before.replace('[Link, useState]', '[Link]'),
    },
    {
      name: "an edited import's other bindings moved to another router package",
      after: before.replace(
        "import { Link, type LinkProps, createLazyFileRoute } from '@tanstack/react-router'\n",
        "import { createLazyFileRoute } from '@tanstack/react-router'\nimport { Link, type LinkProps } from '@tanstack/solid-router'\n",
      ),
    },
  ])('rejects $name', ({ after }) => {
    expect(() => expectOnlyOwnedEdits(before, after)).toThrow()
  })

  // a router package import that binds no route constructor is the user's
  const withOtherImport = `import { Link /* keep */ } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({ component: () => Link })
`

  test('accepts a new id beside an untouched other router package import', () => {
    expectOnlyOwnedEdits(
      withOtherImport,
      withOtherImport.replace("'/old'", "'/new'"),
    )
  })

  test.each([
    {
      name: 'its comment dropped',
      after: withOtherImport
        .replace(' /* keep */', '')
        .replace("'/old'", "'/new'"),
    },
    {
      name: 'its package changed',
      after: withOtherImport.replace(
        "{ Link /* keep */ } from '@tanstack/react-router'",
        "{ Link /* keep */ } from '@tanstack/solid-router'",
      ),
    },
    {
      name: 'merged into the constructor import',
      after: withOtherImport.replace(
        "import { Link /* keep */ } from '@tanstack/react-router'\nimport { createFileRoute }",
        'import { Link, createFileRoute }',
      ),
    },
  ])('rejects the other router package import with $name', ({ after }) => {
    expect(() => expectOnlyOwnedEdits(withOtherImport, after)).toThrow()
  })

  // when the file lacks the constructor import, the binding may join one
  // router package import
  const withoutConstructor = `import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/old')({ component: () => Link })
`

  test.each([
    {
      name: 'joining the router package import',
      after: withoutConstructor.replace('{ Link }', '{ Link, createFileRoute }'),
    },
    {
      name: 'in an import of its own',
      after: withoutConstructor.replace(
        "'@tanstack/react-router'\n",
        "'@tanstack/react-router'\nimport { createFileRoute } from '@tanstack/react-router'\n",
      ),
    },
  ])('accepts a missing constructor import $name', ({ after }) => {
    expectOnlyOwnedEdits(withoutConstructor, after)
  })

  test('rejects a missing constructor import that drops a binding it joins', () => {
    expect(() =>
      expectOnlyOwnedEdits(
        withoutConstructor,
        withoutConstructor.replace('{ Link }', '{ createFileRoute }'),
      ),
    ).toThrow()
  })
})
