/**
 * Controls of the relocation helper (determinism.ts): it checks each root on
 * its own while comparing only the portable projection.
 */
import { describe, expect, test } from 'vitest'
import { expectRelocatable } from '../src/determinism'

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
