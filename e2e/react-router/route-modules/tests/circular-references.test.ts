import { afterEach, beforeEach, expect, test } from 'vitest'
import { Workspace } from './workspace'

let workspace: Workspace

beforeEach(() => {
  workspace = new Workspace(['account', 'products'])
})

afterEach(() => {
  workspace.dispose()
})

test.each([
  ['products', 'account'],
  ['account', 'products'],
])('generates and type-checks %s followed by %s', async (first, second) => {
  await workspace.generate(first)
  await workspace.generate(second)
  expect((await workspace.emitTypes(first)).ok).toBe(true)
  expect((await workspace.emitTypes(second)).ok).toBe(true)
})
