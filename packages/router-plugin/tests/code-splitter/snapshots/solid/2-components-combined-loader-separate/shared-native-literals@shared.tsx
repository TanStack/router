// Both output modules must use the same mutable native regex value.
const pattern = /[a-zé]+/giu;
const values = [123n, null, 'é😀', true] as const;
export { pattern, values };