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
} from '../src/determinism'

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
      portable: (observation, root) => observation.file.slice(root.length),
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
