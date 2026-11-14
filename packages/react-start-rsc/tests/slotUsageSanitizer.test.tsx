import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { sanitizeSlotArgs } from '../src/slotUsageSanitizer'

describe('sanitizeSlotArgs', () => {
  it('preserves shared references without mutating the input', () => {
    const child = { element: createElement('span', null, 'slot') }
    const graph = { left: child, right: child }

    const [first, second] = sanitizeSlotArgs([graph, graph])

    expect(first).toBe(second)
    expect(first.left).toBe(first.right)
    expect(first.left.element).toBe('React element')
    expect(child.element).toEqual(createElement('span', null, 'slot'))
  })

  it('preserves cycles through objects and arrays without mutating the input', () => {
    const object: { children: Array<unknown>; element: unknown } = {
      children: [],
      element: createElement('span', null, 'slot'),
    }
    object.children.push(object, object.children)

    const [result, children] = sanitizeSlotArgs([object, object.children])

    expect(result.children).toBe(children)
    expect(children[0]).toBe(result)
    expect(children[1]).toBe(children)
    expect(result.element).toBe('React element')
    expect(object.children[0]).toBe(object)
    expect(object.element).not.toBe('React element')
  })

  it('preserves sparse arrays and non-plain values', () => {
    const values = new Array(3)
    const date = new Date(0)
    const callback = () => 'slot'
    values[1] = { date, callback, empty: null, missing: undefined }

    const [result] = sanitizeSlotArgs([values])

    expect(result).toHaveLength(3)
    expect(0 in result).toBe(false)
    expect(2 in result).toBe(false)
    expect(result[1]).toEqual(values[1])
    expect(result[1].date).toBe(date)
    expect(result[1].callback).toBe(callback)
  })

  it('reflects input changes without changing previous results', () => {
    const value = { label: 'before' }
    const [before] = sanitizeSlotArgs([value])
    value.label = 'after'
    const [after] = sanitizeSlotArgs([value])

    expect(before).toEqual({ label: 'before' })
    expect(after).toEqual({ label: 'after' })
  })
})
