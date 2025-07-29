---
id: environment-functions
title: Environment Functions
---

## What Are Environment Functions?

Environment functions are utilities designed to define and control function execution based on the runtime environment—whether the code is running on the client or the server. These utilities help ensure that environment-specific logic is executed safely and intentionally, preventing runtime errors and improving maintainability in fullstack or isomorphic applications.

Start provide three core environment functions:

- `createIsomorphicFn`: Compose a single function that adapts to both client and server environments.
- `serverOnly`: Ensures a function can only run on the server.
- `clientOnly`: Ensures a function can only run on the client.

---

## Isomorphic Functions

Use `createIsomorphicFn()` to define functions that behave differently depending on whether they are called on the client or the server. This is useful for safely sharing logic across environments while delegating environment-specific behavior to appropriate handlers. 

> [!WARNING]
> Unimplemented function results in a no-op function.

### Complete Implementation

```tsx
const getEnv = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

const env = getEnv()
// ℹ️ On the **server**, it returns `'server'`.
// ℹ️ On the **client**, it returns `'client'`.
```

### Partial Implementation (Server)

Here is an example of `createIsomorphicFn()` with only server implementation:

```tsx
const serverImplementationOnly = createIsomorphicFn().server(() => 'server')

const server = serverImplementationOnly()
// ℹ️ On the **server**, it returns `'server'`.
// ℹ️ On the **client**, it is no-op (returns `undefined`)
```

### Partial Implementation (Client)

Here is an example of `createIsomorphicFn()` with only client implementation:

```tsx
const clientImplementationOnly = createIsomorphicFn().client(() => 'client')

const client = clientImplementationOnly()
// ℹ️ On the **server**, it is no-op (returns `undefined`)
// ℹ️ On the **client**, it returns `'client'`.
```

### No Implementation

Here is an example of `createIsomorphicFn()` without any environment specific implementation:

```tsx
const noImplementation = createIsomorphicFn()

const noop = noImplementation()
// ℹ️ On both **client** and **server**, it is no-op (returns `undefined`)
```

---

## `env`Only Functions

The `serverOnly` and `clientOnly` helpers enforce strict environment-bound execution. They ensure the decorated function is only callable in the correct runtime context. If misused, they throw descriptive runtime errors to prevent unintentional logic execution.

### `serverOnly`

```tsx
const foo = serverOnly(() => 'bar')

foo() // ✅ On server: returns "bar"
// ❌ On client: throws "serverOnly() functions can only be called on the server!"
```

### `clientOnly`

```tsx
const foo = clientOnly(() => 'bar')

foo() // ✅ On client: returns "bar"
// ❌ On server: throws "clientOnly() functions can only be called on the client!"
```

> [!NOTE]
> These functions are useful for API access, filesystem reads, using browser APIs, or other operations that are invalid or insecure outside their intended environment.

## Tree Shaking

Environment functions are tree-shaken based on the environment for each bundle produced.

On the server, functions created using `createIsomorphicFn()` are tree-shaken. So, all code used inside `.client()` are not included in server bundle, and vice-versa.

On the server, implementation of `clientOnly` functions are replaced with a function that throws an `Error`. The reverse is true for `serverOnly` functions on the client.
