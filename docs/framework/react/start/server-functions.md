---
id: server-functions
title: Server Functions
---

Server functions are functions that run **only** on the server. They are used to perform tasks that should never be directly exposed to the client. Server functions can be defined anywhere in your application, but must be defined at the top level of a file. They can be called from anywhere in your application, including loaders, hooks, etc. They are just asynchronous functions!

## Defining Server Functions

Server functions are defined using the `createServerFn` function, exported from the `@tanstack/start` package. This function must be called with an HTTP verb, and an async function that will be executed on the server. Here's an example:

```tsx
// getServerTime.ts
import { createServerFn } from '@tanstack/start'

export const getServerTime = createServerFn('GET', async () => {
  // Wait for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000))
  // Return the current time
  return new Date().toISOString()
})
```

## Accepting Parameters

Server functions accept a single parameter, which can be a variety of types:

- Primitives
- JSON-serializable objects
- FormData

Here's an example of a server function that accepts a simple string parameter:

```tsx
import { createServerFn } from '@tanstack/start'

export const greet = createServerFn('GET', async (name: string) => {
  return `Hello, ${name}!`
})
```

## Type Safety

Server functions are fully typed, and the type of the parameter is inferred from the function signature:

```tsx
import { createServerFn } from '@tanstack/start'

type Person = {
  name: string
}

export const greet = createServerFn('GET', async (person: Person) => {
  return `Hello, ${person.name}!`
})

function test() {
  greet({ name: 'John' }) // OK
  greet({ name: 123 }) // Error: Argument of type '{ name: number; }' is not assignable to parameter of type 'Person'.
}
```

## JSON Parameters

Server functions can accept JSON-serializable objects as parameters. This is useful for passing complex data structures to the server:

```tsx
import { createServerFn } from '@tanstack/start'

type Person = {
  name: string
  age: number
}

export const greet = createServerFn('GET', async (person: Person) => {
  return `Hello, ${person.name}! You are ${person.age} years old.`
})
```

## FormData Parameters

Server functions can accept `FormData` objects as parameters

```tsx
import { createServerFn } from '@tanstack/start'

export const greetUser = createServerFn('POST', async (formData: FormData) => {
  const name = formData.get('name')
  const age = formData.get('age')

  return `Hello, ${name}! You are ${age} years old.`
})

// Usage
function Test() {
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        const formData = new FormData(event.target)
        const response = await greetUser(formData)
        console.log(response)
      }}
    >
      <input name="name" />
      <input name="age" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

## Server Function Context

In addition to the single parameter that server functions accept, they also have access to a special `context` object that contains information about the current request. This object is useful for accessing headers, cookies, and other request-specific information. It contains properties like:

- `method`: The HTTP method of the request
- `request`: The `Request` object

```tsx
import { createServerFn } from '@tanstack/start'

export const getServerTime = createServerFn('GET', async (context) => {
  console.log(context.method) // GET
  console.log(context.request.headers.get('User-Agent')) // Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3
})
```

## Returning Values

Server functions can return a few different types of values:

- Primitives
- JSON-serializable objects
- `redirect` errors (can also be thrown)
- `notFound` errors (can also be thrown)
- Raw Response objects

## Returning Primitives and JSON

To return any primitive or JSON-serializable object, simply return the value from the server function:

```tsx
import { createServerFn } from '@tanstack/start'

export const getServerTime = createServerFn('GET', async () => {
  return new Date().toISOString()
})

export const getServerData = createServerFn('GET', async () => {
  return {
    message: 'Hello, World!',
  }
})
```

By default, server functions assume that any non-Response object returned is either a primitive or JSON-serializable object.

## Returning Primitives and JSON with custom headers

To return a primitive or JSON-serializable object with custom headers, use the `json` function exported from the `@tanstack/start` package:

```tsx
import { createServerFn, json } from '@tanstack/start'

export const getServerTime = createServerFn('GET', async () => {
  return json(new Date().toISOString(), {
    headers: {
      'X-Custom-Header': 'value',
    },
  })
})
```

## Returning Raw Response objects

To return a raw Response object, simply return a Response object from the server function:

```tsx
import { createServerFn } from '@tanstack/start'

export const getServerTime = createServerFn('GET', async () => {
  // Read a file from s3
  return fetch('https://example.com/time.txt')
})
```

## Throwing Errors

Aside from special `redirect` and `notFound` errors, server functions can throw any custom error. These errors will be serialized and sent to the client as a JSON response along with a 500 status code.

```tsx
import { createServerFn } from '@tanstack/start'

export const doStuff = createServerFn('GET', async () => {
  throw new Error('Something went wrong!')
})

// Usage
function Test() {
  try {
    await doStuff()
  } catch (error) {
    console.error(error)
    // {
    //   message: "Something went wrong!",
    //   stack: "Error: Something went wrong!\n    at doStuff (file:///path/to/file.ts:3:3)"
    // }
  }
}
```

## Calling server functions from within route lifecycles

Server functions can be called normally from route `loader`s, `beforeLoad`s, or any other router-controlled APIs. These APIs are equipped to handle errors, redirects, and notFounds thrown by server functions automatically.

```tsx
import { getServerTime } from './getServerTime'

export const Route = createFileRoute('/time')({
  loader: async () => {
    const time = await getServerTime()

    return {
      time,
    }
  },
})
```

## Calling server functions from hooks and components

Server functions can throw `redirect`s or `notFound`s and while not required, it is recommended to catch these errors and handle them appropriately. To make this easier, the `@tanstack/start` package exports a `useServerFn` hook that can be used to bind server functions to components and hooks:

```tsx
import { useServerFn } from '@tanstack/start'
import { useQuery } from '@tanstack/react-query'
import { getServerTime } from './getServerTime'

export function Time() {
  const getTime = useServerFn(getServerTime)

  const timeQuery = useQuery({
    queryKey: 'time',
    queryFn: () => getTime(),
  })
}
```

## Calling server functions anywhere else

Server functions are just async functions, so they can ultimately be called from anywhere in your application. However, be aware that any redirects or notFounds thrown by server functions will not be handled automatically unless called from a route lifecycle or a component that uses the `useServerFn` hook.

## Redirects

Server functions can throw a `redirect` error to redirect the user to a different URL. This is useful for handling authentication, authorization, or other scenarios where you need to redirect the user to a different page.

- During SSR, redirects are handled by sending a 302 response to the client with the new location
- On the client, redirects are handled by the router automatically from within a route lifecycle or a component that uses the `useServerFn` hook. If you call a server function from anywhere else, redirects will not be handled automatically.

To throw a redirect, you can use the `redirect` function exported from the `@tanstack/start` package:

```tsx
import { createServerFn, redirect } from '@tanstack/start'

export const doStuff = createServerFn('GET', async () => {
  // Redirect the user to the home page
  throw redirect({
    to: '/',
  })
})
```

Redirects can utilize all of the same options as `router.navigate`, `useNavigate()` and `<Link>` components. So feel free to also pass:

- Path Params
- Search Params
- Hash

Redirects can also set the status code of the response by passing a `status` option:

```tsx
import { createServerFn, redirect } from '@tanstack/start'

export const doStuff = createServerFn('GET', async () => {
  // Redirect the user to the home page with a 301 status code
  throw redirect({
    to: '/',
    status: 301,
  })
})
```

## Redirect Headers

You can also set custom headers on a redirect by passing a `headers` option:

```tsx
import { createServerFn, redirect } from '@tanstack/start'

export const doStuff = createServerFn('GET', async () => {
  // Redirect the user to the home page with a custom header
  throw redirect({
    to: '/',
    headers: {
      'X-Custom-Header': 'value',
    },
  })
})
```

## Not Found

While calling a server function from a `loader` or `beforeLoad` route lifecycle, a special `notFound` error can be thrown to indicate to the router that the requested resource was not found. This is more useful than a simple 404 status code, as it allows you to render a custom 404 page, or handle the error in a custom way. If notFound is thrown from a server function used outside of a route lifecycle, it will not be handled automatically.

To throw a notFound, you can use the `notFound` function exported from the `@tanstack/start` package:

```tsx
import { createServerFn, notFound } from '@tanstack/start'

const getStuff = createServerFn('GET', async () => {
  // Randomly return a not found error
  if (Math.random() < 0.5) {
    throw notFound()
  }

  // Or return some stuff
  return {
    stuff: 'stuff',
  }
})

export const Route = createFileRoute('/stuff')({
  loader: async () => {
    const stuff = await getStuff()

    return {
      stuff,
    }
  },
})
```

Not found errors are a core feature of TanStack Router,

## Handling Errors

If a server function throws a (non-redirect/non-notFound) error, it will be serialized and sent to the client as a JSON response along with a 500 status code. This is useful for debugging, but you may want to handle these errors in a more user-friendly way. You can do this by catching the error and handling it in your route lifecycle, component, or hook as you normally would.

```tsx
import { createServerFn } from '@tanstack/start'

export const doStuff = createServerFn('GET', async () => {
  undefined.foo()
})

export const Route = createFileRoute('/stuff')({
  loader: async () => {
    try {
      await doStuff()
    } catch (error) {
      // Handle the error:
      // error === {
      //   message: "Cannot read property 'foo' of undefined",
      //   stack: "TypeError: Cannot read property 'foo' of undefined\n    at doStuff (file:///path/to/file.ts:3:3)"
    }
  },
})
```

## Can I simply use the `use server` directive?

Sure, you can use the `use server` directive instead of the `createServerFn` function, however be aware of some caveats:

- All arguments must be JSON-serializable and are passed as is
- You will not have access to the `context` object, and thus will not be able to access request-specific information like method, headers, cookies, etc.

```tsx
// getServerTime.ts

function greetUser(greeting: string, name: string) {
  'use server'
  return `${greeting}, ${name}!`
}
```

## How do server functions work?

Under the hood, server functions are extracted out of the client bundle and into a separate server bundle. On the server, they are executed as-is, and the result is sent back to the client. On the client, server functions proxy the request to the server, which executes the function and sends the result back to the client, all via `fetch`.

The process looks like this:

- When `createServerFn` is found in a file, the inner function is checked for a `use server` directive
- If the `use server` directive is missing, it is added to the top of the function
- On the client, the inner function is extracted out of the client bundle and into a separate server bundle
- The client-side server function is replaced with a proxy function that sends a request to the server to execute the function that was extracted
- On the server, the server function is no extracted and is executed as-is
- After extraction occurs, each bundle applies a dead-code elimination process to remove any unused code from each bundle.
