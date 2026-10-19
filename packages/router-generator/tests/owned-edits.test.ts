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
  ])('rejects $name', ({ after }) => {
    expect(() => expectOnlyOwnedEdits(before, after)).toThrow()
  })
})
