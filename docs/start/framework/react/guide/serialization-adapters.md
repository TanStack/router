---
id: serialization-adapters
title: Serialization Adapters
---

Values that cross from the server to the client are serialized: transported lifecycle results (see [SSR Data Transport](./ssr-data-transport.md)) and the arguments and results of server functions. The serializer handles the common types out of the box. For a type it does not know, such as a class instance, you register a serialization adapter once. After that the type can appear anywhere in transported data, nested as deep as you like, and TypeScript accepts it in the serializability check.

## What is serializable without an adapter

At the type level, these pass the serializability check:

- `string`, `number`, `boolean`, `bigint`, `null`, `undefined`
- `Date`, `Uint8Array`
- plain objects and arrays of the above, including tuples and readonly arrays
- `Set`, `Map`, `Promise`, `ReadableStream` and `AsyncGenerator` whose contents pass the check
- the input type of every registered adapter

Functions do not pass, which also rules out class instances with methods.

## Create an adapter

`createSerializationAdapter` is exported from `@tanstack/react-router`. An adapter has four parts:

- `key`: a non-empty string that identifies the adapter in the payload.
- `test`: a type guard that decides whether a value belongs to this adapter.
- `toSerializable`: turns the value into something the serializer already handles.
- `fromSerializable`: turns that back into the original type on the receiving side.

```tsx
// src/decimal-adapter.ts
import { createSerializationAdapter } from '@tanstack/react-router'
import { Decimal } from 'decimal.js'

export const decimalAdapter = createSerializationAdapter({
  key: 'decimal',
  test: (v): v is Decimal => v instanceof Decimal,
  toSerializable: (v) => v.toString(),
  fromSerializable: (s) => new Decimal(s),
})
```

The return type of `toSerializable` is itself checked for serializability. It can use the built-in types and the input types of adapters listed in `extends`:

```tsx
const innerAdapter = createSerializationAdapter({
  key: 'inner',
  test: (v): v is Inner => v instanceof Inner,
  toSerializable: (inner) => inner.value,
  fromSerializable: (value) => new Inner(value),
})

const outerAdapter = createSerializationAdapter({
  key: 'outer',
  extends: [innerAdapter],
  test: (v): v is Outer => v instanceof Outer,
  toSerializable: (outer) => outer.inner, // an Inner, handled by innerAdapter
  fromSerializable: (inner) => new Outer(inner),
})
```

An adapter listed in `extends` is registered together with the adapter that extends it.

## Register adapters

Pass the adapters to `createStart`. Start hands them to the server when it serializes the payload and to the client when it reads it.

```tsx
// src/start.ts
import { createStart } from '@tanstack/react-start'
import { decimalAdapter } from './decimal-adapter'

export const startInstance = createStart(() => ({
  serializationAdapters: [decimalAdapter],
}))
```

## The type-level effect

Once `decimalAdapter` is registered, a transported loader result containing a `Decimal` type-checks:

```tsx
export const Route = createFileRoute('/invoice/$id')({
  loader: async ({ params }) => ({
    id: params.id,
    total: await fetchInvoiceTotal(params.id), // a Decimal: accepted, decimalAdapter is registered
  }),
})
```

Without the adapter the same loader reports a serializability error that names `total`.

## Adapter or `dehydrate`/`hydrate`?

> **Experimental:** `dehydrate` and `hydrate` are experimental and subject to change.

Both let you change what goes over the wire, so pick by where the problem is:

- The problem is a type. A value that does not serialize shows up in several routes or server functions, and the way to serialize it does not depend on the route. Register an adapter once and return the value as you would any other.
- The problem is one route's data. The route wants a smaller wire payload, or the client needs to rebuild something from route context (query options, a client-side cache entry) that must never be serialized. Use the object form with `dehydrate` and `hydrate` on that lifecycle; see [SSR Data Transport](./ssr-data-transport.md).

An adapter is not a lifecycle option and knows nothing about routes. `dehydrate` and `hydrate` are per lifecycle and receive the route's options. The two compose: a `dehydrate` function may return a value that relies on a registered adapter.
