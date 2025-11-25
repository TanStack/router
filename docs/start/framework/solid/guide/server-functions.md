---
ref: docs/start/framework/react/guide/server-functions.md
replace:
  {
    '@tanstack/react-start': '@tanstack/solid-start',
    'React': 'SolidJS',
    '@tanstack/react-router': '@tanstack/solid-router',
  }
---

### Custom serialization adapters

You can create custom serialization adapters to handle complex types that can't be serialized by default.

Example:

```ts
// src/start.ts
import { createStart } from '@tanstack/solid-start'
import { createSerializationAdapter } from '@tanstack/solid-router'

const bigIntAdapter = createSerializationAdapter({
  key: 'bigint',
  test: (value: unknown): value is bigint => typeof value === 'bigint',
  toSerializable: (bigInt) => bigInt.toString(),
  fromSerializable: (value) => BigInt(value),
})

export const startInstance = createStart(() => {
  return {
    serializationAdapters: [bigIntAdapter],
  }
})
```
