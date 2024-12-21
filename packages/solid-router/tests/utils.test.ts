import { describe, expect, it } from 'vitest'
import { deepEqual, isPlainArray, replaceEqualDeep } from '../src/utils'

describe('replaceEqualDeep', () => {
  it('should return the same object if the input objects are equal', () => {
    const obj = { a: 1, b: 2 }
    const result = replaceEqualDeep(obj, obj)
    expect(result).toBe(obj)
  })

  it('should return a new object with replaced values if the input objects are not equal', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 3 }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should handle arrays correctly', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2, 4]
    const result = replaceEqualDeep(arr1, arr2)
    expect(result).toStrictEqual(arr2)
  })

  it('should handle nested objects correctly', () => {
    const obj1 = { a: 1, b: { c: 2 } }
    const obj2 = { a: 1, b: { c: 3 } }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should properly handle non-existent keys', () => {
    const obj1 = { a: 2, c: 123 }
    const obj2 = { a: 2, c: 123, b: undefined }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should correctly handle non-existent keys with the same number of fields', () => {
    const obj1 = { a: 2, c: 123 }
    const obj2 = { a: 2, b: undefined }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should return the previous value when the next value is an equal primitive', () => {
    expect(replaceEqualDeep(1, 1)).toBe(1)
    expect(replaceEqualDeep('1', '1')).toBe('1')
    expect(replaceEqualDeep(true, true)).toBe(true)
    expect(replaceEqualDeep(false, false)).toBe(false)
    expect(replaceEqualDeep(null, null)).toBe(null)
    expect(replaceEqualDeep(undefined, undefined)).toBe(undefined)
  })
  it('should return the next value when the previous value is a different value', () => {
    const date1 = new Date()
    const date2 = new Date()
    expect(replaceEqualDeep(1, 0)).toBe(0)
    expect(replaceEqualDeep(1, 2)).toBe(2)
    expect(replaceEqualDeep('1', '2')).toBe('2')
    expect(replaceEqualDeep(true, false)).toBe(false)
    expect(replaceEqualDeep(false, true)).toBe(true)
    expect(replaceEqualDeep(date1, date2)).toBe(date2)
  })

  it('should return the next value when the previous value is a different type', () => {
    const array = [1]
    const object = { a: 'a' }
    expect(replaceEqualDeep(0, undefined)).toBe(undefined)
    expect(replaceEqualDeep(undefined, 0)).toBe(0)
    expect(replaceEqualDeep(2, undefined)).toBe(undefined)
    expect(replaceEqualDeep(undefined, 2)).toBe(2)
    expect(replaceEqualDeep(undefined, null)).toBe(null)
    expect(replaceEqualDeep(null, undefined)).toBe(undefined)
    expect(replaceEqualDeep({}, undefined)).toBe(undefined)
    expect(replaceEqualDeep([], undefined)).toBe(undefined)
    expect(replaceEqualDeep(array, object)).toBe(object)
    expect(replaceEqualDeep(object, array)).toBe(array)
  })

  it('should return the previous value when the next value is an equal array', () => {
    const prev = [1, 2]
    const next = [1, 2]
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return a copy when the previous value is a different array subset', () => {
    const prev = [1, 2]
    const next = [1, 2, 3]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
  })

  it('should return a copy when the previous value is a different array superset', () => {
    const prev = [1, 2, 3]
    const next = [1, 2]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
  })

  it('should return the previous value when the next value is an equal empty array', () => {
    const prev: Array<any> = []
    const next: Array<any> = []
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return the previous value when the next value is an equal empty object', () => {
    const prev = {}
    const next = {}
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return the previous value when the next value is an equal object', () => {
    const prev = { a: 'a' }
    const next = { a: 'a' }
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should replace different values in objects', () => {
    const prev = { a: { b: 'b' }, c: 'c' }
    const next = { a: { b: 'b' }, c: 'd' }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.a).toBe(prev.a)
    expect(result.c).toBe(next.c)
  })

  it('should replace different values in arrays', () => {
    const prev = [1, { a: 'a' }, { b: { b: 'b' } }, [1]] as const
    const next = [1, { a: 'a' }, { b: { b: 'c' } }, [1]] as const
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).not.toBe(next[2])
    expect(result[2].b.b).toBe(next[2].b.b)
    expect(result[3]).toBe(prev[3])
  })

  it('should replace different values in arrays when the next value is a subset', () => {
    const prev = [{ a: 'a' }, { b: 'b' }, { c: 'c' }]
    const next = [{ a: 'a' }, { b: 'b' }]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).toBeUndefined()
  })

  it('should replace different values in arrays when the next value is a superset', () => {
    const prev = [{ a: 'a' }, { b: 'b' }]
    const next = [{ a: 'a' }, { b: 'b' }, { c: 'c' }]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).toBe(next[2])
  })

  it('should copy objects which are not arrays or objects', () => {
    const prev = [{ a: 'a' }, { b: 'b' }, { c: 'c' }, 1]
    const next = [{ a: 'a' }, new Map(), { c: 'c' }, 2]
    const result = replaceEqualDeep(prev, next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(next[1])
    expect(result[2]).toBe(prev[2])
    expect(result[3]).toBe(next[3])
  })

  it('should support equal objects which are not arrays or objects', () => {
    const map = new Map()
    const prev = [map, [1]]
    const next = [map, [1]]
    const result = replaceEqualDeep(prev, next)
    expect(result).toBe(prev)
  })

  it('should support non equal objects which are not arrays or objects', () => {
    const map1 = new Map()
    const map2 = new Map()
    const prev = [map1, [1]]
    const next = [map2, [1]]
    const result = replaceEqualDeep(prev, next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(next[0])
    expect(result[1]).toBe(prev[1])
  })

  it('should support objects which are not plain arrays', () => {
    const prev = Object.assign([1, 2], { a: { b: 'b' }, c: 'c' })
    const next = Object.assign([1, 2], { a: { b: 'b' }, c: 'c' })
    const result = replaceEqualDeep(prev, next)
    expect(result).toBe(next)
  })

  it('should replace all parent objects if some nested value changes', () => {
    const prev = {
      todo: { id: '1', meta: { createdAt: 0 }, state: { done: false } },
      otherTodo: { id: '2', meta: { createdAt: 0 }, state: { done: true } },
    }
    const next = {
      todo: { id: '1', meta: { createdAt: 0 }, state: { done: true } },
      otherTodo: { id: '2', meta: { createdAt: 0 }, state: { done: true } },
    }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.todo).not.toBe(prev.todo)
    expect(result.todo).not.toBe(next.todo)
    expect(result.todo.id).toBe(next.todo.id)
    expect(result.todo.meta).toBe(prev.todo.meta)
    expect(result.todo.state).not.toBe(next.todo.state)
    expect(result.todo.state.done).toBe(next.todo.state.done)
    expect(result.otherTodo).toBe(prev.otherTodo)
  })

  it('should replace all parent arrays if some nested value changes', () => {
    const prev = {
      todos: [
        { id: '1', meta: { createdAt: 0 }, state: { done: false } },
        { id: '2', meta: { createdAt: 0 }, state: { done: true } },
      ],
    }
    const next = {
      todos: [
        { id: '1', meta: { createdAt: 0 }, state: { done: true } },
        { id: '2', meta: { createdAt: 0 }, state: { done: true } },
      ],
    }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.todos).not.toBe(prev.todos)
    expect(result.todos).not.toBe(next.todos)
    expect(result.todos[0]).not.toBe(prev.todos[0])
    expect(result.todos[0]).not.toBe(next.todos[0])
    expect(result.todos[0]?.id).toBe(next.todos[0]?.id)
    expect(result.todos[0]?.meta).toBe(prev.todos[0]?.meta)
    expect(result.todos[0]?.state).not.toBe(next.todos[0]?.state)
    expect(result.todos[0]?.state.done).toBe(next.todos[0]?.state.done)
    expect(result.todos[1]).toBe(prev.todos[1])
  })

  it('should be able to share values that contain undefined', () => {
    const current = [
      {
        data: undefined,
        foo: true,
      },
    ]

    const next = replaceEqualDeep(current, [
      {
        data: undefined,
        foo: true,
      },
    ])

    expect(current).toBe(next)
  })

  it('should return the previous value when both values are an array of undefined', () => {
    const current = [undefined]
    const next = replaceEqualDeep(current, [undefined])

    expect(next).toBe(current)
  })

  it('should return the previous value when both values are an array that contains undefined', () => {
    const current = [{ foo: 1 }, undefined]
    const next = replaceEqualDeep(current, [{ foo: 1 }, undefined])

    expect(next).toBe(current)
  })
})

describe('isPlainArray', () => {
  it('should return `true` for plain arrays', () => {
    expect(isPlainArray([1, 2])).toEqual(true)
  })

  it('should return `false` for non plain arrays', () => {
    expect(isPlainArray(Object.assign([1, 2], { a: 'b' }))).toEqual(false)
  })
})

describe('deepEqual', () => {
  describe.each([false, true])('partial = %s', (partial) => {
    it('should return `true` for equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      const b = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      expect(deepEqual(a, b, { partial })).toEqual(true)
      expect(deepEqual(b, a, { partial })).toEqual(true)
    })

    it('should return `false` for non equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c' }
      const b = { a: { b: 'c' }, c: 'c' }
      expect(deepEqual(a, b, { partial })).toEqual(false)
      expect(deepEqual(b, a, { partial })).toEqual(false)
    })

    it('should return `true` for equal objects and ignore `undefined` properties', () => {
      const a = { a: 'a', b: undefined, c: 'c' }
      const b = { a: 'a', c: 'c' }
      expect(deepEqual(a, b, { partial })).toEqual(true)
      expect(deepEqual(b, a, { partial })).toEqual(true)
    })

    it('should return `true` for equal objects and ignore `undefined` nested properties', () => {
      const a = { a: { b: 'b', x: undefined }, c: 'c' }
      const b = { a: { b: 'b' }, c: 'c', d: undefined }
      expect(deepEqual(a, b, { partial })).toEqual(true)
      expect(deepEqual(b, a, { partial })).toEqual(true)
    })

    it('should return `true` for equal arrays and ignore `undefined` object properties', () => {
      const a = { a: { b: 'b' }, c: undefined }
      const b = { a: { b: 'b' } }
      expect(deepEqual([a], [b], { partial })).toEqual(true)
      expect(deepEqual([b], [a], { partial })).toEqual(true)
    })

    it('should return `true` for equal arrays and ignore nested `undefined` object properties', () => {
      const a = { a: { b: 'b', x: undefined }, c: 'c' }
      const b = { a: { b: 'b' }, c: 'c' }
      expect(deepEqual([a], [b], { partial })).toEqual(true)
      expect(deepEqual([b], [a], { partial })).toEqual(true)
    })
  })

  describe('ignoreUndefined = false', () => {
    const ignoreUndefined = false
    describe('partial = false', () => {
      const partial = false
      it('should return `false` for objects', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c', d: undefined }
        expect(deepEqual(a, b, { partial, ignoreUndefined })).toEqual(false)
        expect(deepEqual(b, a, { partial, ignoreUndefined })).toEqual(false)
      })

      it('should return `false` for arrays', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c' }
        expect(deepEqual([a], [b], { partial, ignoreUndefined })).toEqual(false)
        expect(deepEqual([b], [a], { partial, ignoreUndefined })).toEqual(false)
      })
    })
    describe('partial = true', () => {
      const partial = true
      it('should return `true` for objects', () => {
        const a = { a: { b: 'b' }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c', d: undefined }
        expect(deepEqual(a, b, { partial, ignoreUndefined })).toEqual(true)
        expect(deepEqual(b, a, { partial, ignoreUndefined })).toEqual(true)
      })

      it('should return `true` for arrays', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c' }
        expect(deepEqual([a], [b], { partial, ignoreUndefined })).toEqual(true)
        expect(deepEqual([b], [a], { partial, ignoreUndefined })).toEqual(true)
      })
    })
  })

  describe('partial comparison', () => {
    it('correctly compares partially equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      const b = { a: { b: 'b' }, c: 'c' }
      expect(deepEqual(a, b, { partial: true })).toEqual(true)
      expect(deepEqual(b, a, { partial: true })).toEqual(false)
    })

    it('correctly compares partially equal objects and ignores `undefined` object properties', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }], e: undefined }
      const b = { a: { b: 'b' }, c: 'c', d: undefined }
      expect(deepEqual(a, b, { partial: true })).toEqual(true)
      expect(deepEqual(b, a, { partial: true })).toEqual(false)
    })
  })
})
