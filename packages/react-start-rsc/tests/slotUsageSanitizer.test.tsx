import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { sanitizeSlotArgs } from '../src/slotUsageSanitizer'

describe('sanitizeSlotArgs', () => {
  it('visits shared slot objects once per invocation', () => {
    let reads = 0
    let graph: object = { value: 'leaf' }
    for (let depth = 0; depth < 18; depth++) {
      const child = graph
      graph = {
        get left() {
          reads++
          return child
        },
        get right() {
          reads++
          return child
        },
      }
    }

    const [first, second] = sanitizeSlotArgs([graph, graph])

    expect(reads).toBe(36)
    expect(first).toBe(second)
    expect(first).not.toBe(graph)
    expect(first.left).toBe(first.right)
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
    expect(result[1]).not.toBe(values[1])
    expect(result[1].date).toBe(date)
    expect(result[1].callback).toBe(callback)
  })

  it('does not reuse sanitized objects across calls', () => {
    const value = { label: 'before' }
    const [before] = sanitizeSlotArgs([value])
    value.label = 'after'
    const [after] = sanitizeSlotArgs([value])

    expect(before).toEqual({ label: 'before' })
    expect(after).toEqual({ label: 'after' })
    expect(after).not.toBe(before)
  })
})
