---
id: server-functions
title: Server Functions
---

As [TanStack Start](./tanstack-start.md) is a full-stack framework, we need a way to call a function on the client which then executes some code on the server.

This is where Server Functions come in.

## What are Server Functions?

> 🧠 You can think of Server Functions like mini-portals that let your users trigger a pre-defined action on the server (like a built-in RPC solution 🤯).

Server Functions are actions that can be executed on the server from the client or from other server functions.

When a server function is called, it will execute the server-side code and return the result to the caller (regardless of whether the caller is a client or another server function).

Server Functions are more than just a way to send and receive data. They're like a bridge that lets you connect your backend code (the behind-the-scenes magic) directly to your frontend code (what the user sees), making it easier to build a seamless user experience.

## How to use Server Functions in TanStack Start

While some frameworks use special pragmas to denote a function that will execute on the server, Start uses a utility to
create an instance of a server function.

```typescript
const yourFn = createServerFn('POST', async () => {
  // Server-side code lives here
})
```

This function can then be called from the client:

```tsx
function Component() {
  // Just to demonstrate that this is a client-side function
  const buttonRef = (el: HTMLButtonElement) => {
    if (!el) return
    el.addEventListener('click', async () => {
      const result = await yourFn()
      console.info(result)
    })
  }

  return <button ref={buttonRef}>Click me!</button>
}

// Or, even just:
function Component() {
  return <button onClick={yourFn}>Click me!</button>
}
```

Or from another server function:

```typescript
const yourFn2 = createServerFn('POST', async () => {
  const result = await yourFn()
  console.info(result)
})
```

Or even from other server-side code:

```typescript
async function someServerFunction() {
  const result = await yourFn()
  console(result)
}
```

When this function is called from the client, it will make a request to the server, execute the server-side code, and
return the serialized result to the client.

## Server Function Arguments

Like any function, server functions can take arguments:

```typescript
const yourFn = createServerFn('POST', async (val: number) => {
  // Server-side code lives here
})

// Call it like this:
yourFn(123)
```

Only one argument is supported, but you can pass an object if you need to pass multiple values:

```typescript
const yourFn = createServerFn('POST', async (obj: { a: number; b: number }) => {
  // Server-side code lives here
})
```

Any serializable value can be passed as an argument to a server function.

## Serialization

Anything that can be serialized via `JSON.stringify` and `JSON.parse` can be used as an argument to or returned from a
server function.

This includes:

- `string`
- `number`
- `boolean`
- `null`
- `Array`
- `Object`

In addition, we support serializing the following:

- [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)s of other serializable types
- [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)s of other
  serializable types

## No-JS Server Functions

Without JavaScript enabled, there's only one way to execute server functions: by submitting a form.

This is done by adding a `form` element to the page
with [the HTML attribute `action`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/action).

> Notice that we mentioned the **HTML** attribute `action`. This attribute only accepts a string in HTML, just like all
> other attributes.
>
> While React
> 19 [added support for passing a function to `action`](https://react.dev/reference/react-dom/components/form#form),
> it's
> a React-specific feature and not part of the HTML standard.

The `action` attribute tells the browser where to send the form data when the form is submitted. In this case, we want
to send the form data to the server function.

To do this, we can utilize the `url` property of the server function:

```typescript
const yourFn = createServerFn('POST', async () => {
  // Server-side code lives here
})

console.info(yourFn.url)
```

And pass this to the `action` attribute of the form:

```tsx
function Component() {
  return (
    <form action={yourFn.url} method="POST">
      <button type="submit">Click me!</button>
    </form>
  )
}
```

When the form is submitted, the server function will be executed.

### No-JS Server Function Arguments

To pass arguments to a server function when submitting a form, you can use the `input` element with the `name` attribute
to attach the argument to the [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData) passed to your
server function:

```tsx
const yourFn = createServerFn('POST', async (formData: FormData) => {
  // `val` will be '123'
  const val = formData.get('val')
  // ...
})

function Component() {
  return (
    //  We need to tell the server that our data type is `multipart/form-data` by setting the `encType` attribute on the form.
    <form action={yourFn.url} method="POST" encType="multipart/form-data">
      <input name="val" defaultValue="123" />
      <button type="submit">Click me!</button>
    </form>
  )
}
```

When the form is submitted, the server function will be executed with the form's data as an argument.

### No-JS Server Function Return Value

Regardless of whether JavaScript is enabled, the server function will return a response to the HTTP request made from
the client.

When JavaScript is enabled, this response can be accessed as the return value of the server function in the client's
JavaScript code.

```typescript
const yourFn = createServerFn('POST', async () => {
  return 'Hello, world!'
})

// `.then` is not available when JavaScript is disabled
yourFn().then(console.log)
```

However, when JavaScript is disabled, there is no way to access the return value of the server function in the client's
JavaScript code.

Instead, the server function can provide a response to the client, telling the browser to navigate in a certain way.

When combined with a `loader`, we're able to provide an experience similar to a single-page application, even when
JavaScript is disabled;
all by telling the browser to reload the current page with new data piped through the `loader`:

```tsx
import * as fs from 'fs'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn('GET', () => {
  return readCount()
})

const updateCount = createServerFn('POST', async (formData: FormData) => {
  const count = await readCount()
  const addBy = Number(formData.get('addBy'))
  await fs.promises.writeFile(filePath, `${count + addBy}`)
  // Reload the page to trigger the loader again
  return new Response('ok', { status: 301, headers: { Location: '/' } })
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const state = Route.useLoaderData()

  return (
    <div>
      <form
        action={updateCount.url}
        method="POST"
        encType={'multipart/form-data'}
      >
        <input type="number" name="addBy" defaultValue="1" />
        <button type="submit">Add</button>
      </form>
      <pre>{state}</pre>
    </div>
  )
}
```
