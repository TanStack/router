import { describe, it, expect } from 'vitest'
import { replaceEqualDeep } from '../src/utils';

describe('replaceEqualDeep', () => {
  it('should return the same object if the input objects are equal', () => {
    const obj = { a: 1, b: 2 };
    const result = replaceEqualDeep(obj, obj);
    expect(result).toBe(obj);
  });

  it('should return a new object with replaced values if the input objects are not equal', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 3 };
    const result = replaceEqualDeep(obj1, obj2);
    expect(result).toStrictEqual(obj2);
  });

  it('should handle arrays correctly', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 4];
    const result = replaceEqualDeep(arr1, arr2);
    expect(result).toStrictEqual(arr2);
  });

  it('should handle nested objects correctly', () => {
    const obj1 = { a: 1, b: { c: 2 } };
    const obj2 = { a: 1, b: { c: 3 } };
    const result = replaceEqualDeep(obj1, obj2);
    expect(result).toStrictEqual(obj2);
  });

  it('should properly handle non-existent keys', () => {
    const obj1 = { a: 2, c: 123 }
    const obj2 = { a: 2, b: undefined };
    const result = replaceEqualDeep(obj1, obj2);
    expect(result).toStrictEqual(obj2);
  })
});