/**
 * Builder shapes the Start compiler does not recognise (review 1, claim #10;
 * SPEC J4.5, J4.12, G5): each module either keeps its server code out of the
 * client, or is reported (a compile error, or a warning or error naming the
 * file). Through the public Start host (`./start-host`).
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { compileError, useStartHost } from './regression-helpers'

const host = useStartHost()

const dbFile = `export const db = { x: () => 'from the server', secret: () => 'secret' }\n`

interface Shape {
  name: string
  code: string
  /** Server code the client must not hold. */
  body: string
  files?: Record<string, string>
}

/**
 * The client holds no server code and loads nothing server-only, or the
 * module is reported: a compile error in an environment, or a warning or
 * error naming the module.
 */
async function expectNoSilentLeak(shape: Shape) {
  const startCase = await (
    await host()
  ).case({
    'db.server.ts': dbFile,
    'module.tsx': shape.code,
    ...shape.files,
  })
  const mark = startCase.diagnostics().length
  for (const environment of ['client', 'ssr'] as const) {
    if ((await compileError(startCase, environment)) !== undefined) {
      return
    }
  }
  const client = await startCase.served('module.tsx', 'client')
  const loads = await startCase.loads()
  const reported = findDiagnostics(startCase.diagnostics().slice(mark), {
    file: startCase.file(),
  }).filter((diagnostic) => diagnostic.severity !== 'info')
  if (reported.length > 0) {
    return
  }
  expect({
    holdsServerCode: client.includes(shape.body),
    loadsServerOnly: loads.includes('./db.server'),
  }).toEqual({ holdsServerCode: false, loadsServerOnly: false })
}

describe('unrecognised builder shapes never leak silently', () => {
  test.each<Shape>([
    {
      name: 'createServerFn destructured from a namespace import',
      code: `import * as Start from '@tanstack/react-start'
import { db } from './db.server'
const { createServerFn } = Start
export const fn = createServerFn().handler(async () => db.x())`,
      body: 'db.x()',
    },
    {
      name: 'a builder chosen by a ternary',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const base = Math.random() > 2 ? createServerFn({ method: 'POST' }) : createServerFn()
export const fn = base.handler(async () => db.x())`,
      body: 'db.x()',
    },
    {
      name: 'a builder method read into a variable',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
const handler = createServerFn().handler
export const fn = handler(async () => db.x())`,
      body: 'db.x()',
    },
    {
      name: 'a block-bodied factory that returns a builder from an if',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
function make(post: boolean) {
  if (post) {
    return createServerFn({ method: 'POST' })
  }
  return createServerFn()
}
export const fn = make(false).handler(async () => db.x())`,
      body: 'db.x()',
    },
    {
      name: 'a wrapper that passes its argument to createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const serverOnly = <T extends () => unknown>(fn: T) => createServerOnlyFn(fn)
export const read = serverOnly(() => db.secret())`,
      body: 'db.secret()',
    },
  ])('$name', async (shape) => {
    await expectNoSilentLeak(shape)
  })

  // .fails: the client build fails where the wrapper passes its parameter, in `wrap.ts`;
  // a dev server serves the module calling it, argument included, before
  // the wrapper's module fails (the build is the guarantee).
  test.fails.each<Shape>([
    {
      name: 'a wrapper of another module that passes its argument to createServerOnlyFn',
      code: `import { serverOnly } from './wrap'
import { db } from './db.server'
export const read = serverOnly(() => db.secret())`,
      body: 'db.secret()',
      files: {
        'wrap.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export const serverOnly = <T extends () => unknown>(fn: T) => createServerOnlyFn(fn)
`,
      },
    },
  ])('$name', async (shape) => {
    await expectNoSilentLeak(shape)
  })
})
