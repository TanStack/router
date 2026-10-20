/**
 * Controls of the determinism and relocation helpers (determinism.ts):
 * reorderings really reorder, determinism compares every variant, and
 * relocation checks each root on its own while comparing only the portable
 * projection.
 */
import { describe, expect, test } from 'vitest'
import {
  expectDeterministic,
  expectRelocatable,
  reorderedRecords,
  reorderings,
  withoutRoot,
} from '../src/determinism'
import { createModuleGraph } from '../src/module-linker'

describe('reorderings', () => {
  test('give the order, the reverse and an interleaving', () => {
    expect(reorderings([1, 2, 3, 4])).toEqual([
      { name: 'given order', items: [1, 2, 3, 4] },
      { name: 'reversed', items: [4, 3, 2, 1] },
      { name: 'interleaved', items: [2, 4, 1, 3] },
    ])
  })

  test('drop orders that coincide', () => {
    expect(reorderings([1, 2]).map(({ name }) => name)).toEqual([
      'given order',
      'reversed',
    ])
  })

  test('reorder the entries of a record', () => {
    expect(
      reorderedRecords({ a: 1, b: 2, c: 3 }).map(({ record }) =>
        Object.keys(record),
      ),
    ).toEqual([
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
      ['b', 'a', 'c'],
    ])
  })
})

describe('expectDeterministic', () => {
  test('passes when every variant observes the same and returns the observations', async () => {
    const observations = await expectDeterministic(
      reorderings(['b', 'a']),
      ({ items }) => [...items].sort(),
    )
    expect(observations).toHaveLength(2)
  })

  test('fails when one variant observes something else', async () => {
    await expect(
      expectDeterministic(reorderings(['b', 'a']), ({ items }) => items[0]),
    ).rejects.toThrow()
  })
})

describe('a semantic projection', () => {
  // Three outputs of one module, as a compiler might emit them: the second
  // only renames private bindings and prints differently, the third
  // computes another value and breaks the shared identity.
  const outputs = [
    `const shared = { n: 1 }
export const loader = () => shared.n + 1
export const read = () => shared`,
    `const _shared$1 = {n:1};
const _load = () => _shared$1.n + 1;
export { _load as loader };
export const read = () => _shared$1;`,
    `export const loader = () => 3
export const read = () => ({ n: 1 })`,
  ]
  /** What the module does when it runs: its loader's value, shared identity. */
  const run = async (code: string) => {
    const exports = await createModuleGraph({
      modules: { '/output.ts': code },
    }).import('/output.ts')
    return {
      code,
      data: exports.loader(),
      sharedIdentity: exports.read() === exports.read(),
    }
  }
  const project = ({
    data,
    sharedIdentity,
  }: Awaited<ReturnType<typeof run>>) => ({
    data,
    sharedIdentity,
  })

  test('ignores private names and printing, and returns the full observations', async () => {
    const observations = await expectDeterministic(outputs.slice(0, 2), run, {
      project,
    })
    expect(observations.map(({ code }) => code)).toEqual(outputs.slice(0, 2))
  })

  test('detects another value or a broken shared identity', async () => {
    await expect(
      expectDeterministic([outputs[0]!, outputs[2]!], run, { project }),
    ).rejects.toThrow()
    await expect(
      expectRelocatable(
        ['/a', '/b'],
        (root) => run(outputs[root === '/a' ? 0 : 2]!),
        {
          check: () => {},
          portable: project,
        },
      ),
    ).rejects.toThrow()
  })
})

describe('expectRelocatable', () => {
  const observe = (root: string) => ({
    // An opaque id may differ between roots.
    id: `${root.length}`,
    callerId: `${root.length}`,
    file: `${root}/src/a.ts`,
  })

  test('checks each root and compares only the portable projection', async () => {
    const checked: Array<string> = []
    await expectRelocatable(['/a', '/deeper/b'], observe, {
      check: (observation, root) => {
        checked.push(root)
        expect(observation.callerId).toBe(observation.id)
      },
      portable: (observation, root) => withoutRoot(observation.file, root),
    })
    expect(checked).toEqual(['/a', '/deeper/b'])
  })

  test('fails when a root fails its own check or the portable projections differ', async () => {
    await expect(
      expectRelocatable(['/a'], observe, {
        check: (observation) => expect(observation.id).toBe('wrong'),
      }),
    ).rejects.toThrow()
    await expect(
      expectRelocatable(['/a', '/b'], observe, {
        check: () => {},
        portable: (observation) => observation.file,
      }),
    ).rejects.toThrow()
  })
})

test('withoutRoot replaces every spelling of the root, in values and keys', () => {
  expect(
    withoutRoot(
      {
        '/app/src/a.ts': [
          'file:///app/src/a.ts:1:2',
          '\\app\\src\\a.ts',
          '/application/x',
        ],
      },
      '/app',
    ),
  ).toEqual({
    '<root>/src/a.ts': [
      '<root>/src/a.ts:1:2',
      '<root>\\src\\a.ts',
      '/application/x',
    ],
  })
})
