<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# TanStack Server Functions Plugin

## Configuration

Create a new instance of the plugin with the following options:

```ts
TanStackServerFnPlugin({
  // This is the ID that will be available to look up and import
  // our server function manifest and resolve its module
  manifestVirtualImportId: 'tanstack:server-fn-manifest',
  generateFunctionId: startPluginOpts?.serverFns?.generateFunctionId,
  client: {
    getRuntimeCode: () =>
      `import { createClientRpc } from '@tanstack/${corePluginOpts.framework}-start/client-rpc'`,
    replacer: (d) => `createClientRpc('${d.functionId}')`,
    envName: 'client',
  },
  server: {
    getRuntimeCode: () =>
      `import { createServerRpc } from '@tanstack/${corePluginOpts.framework}-start/server-rpc'`,
    replacer: (d) => `createServerRpc('${d.functionId}', ${d.fn})`,
    envName: 'ssr',
  },
}),
```

## Providing the wrapper implementations

Each runtime replacement should be implemented by your framework. Generally, on the client runtime, you'll end up using a `fetch` call to call the server function your desired endpoint, like this:

```ts
function createClientRpc(functionId: string) {
  const url = `${process.env.YOUR_SERVER_BASE}/_serverFn/${functionId}`

  const fn = async (...args: any[]) => {
    const res = await fetch(url, {
      method: 'POST',
      // You'll likely want to use a better serializer here
      body: JSON.stringify(args),
    })

    return await res.json()
  }

  // You can also assign any other properties you want to the function
  // for things like form actions, or debugging
  Object.assign(fn, {
    url: url,
  })

  return fn
}
```

## Using the manifest

In your server handler, you can import the manifest and use it to look up and dynamically import the server function you want to call.

```ts
import { getServerFnById } from 'tanstack:server-fn-manifest'

export const handler = async (req: Request) => {
  const functionId = req.url.split('/').pop()
  invariant(functionId, 'No function ID provided')

  const serverFn = await getServerFnById(functionId)

  const args = await req.json()

  return await serverFn(...args)
}
```
