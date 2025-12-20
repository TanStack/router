// Test file: Multiple named exports - some should be removed
export const foo = () => 'foo'
export const bar = () => 'bar'
export const baz = () => 'baz'

const internal = 'internal'
export const qux = () => internal
