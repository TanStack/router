<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# TanStack Server Functions Plugin

## Configuration

Create a new instance of the plugin with the following options:

```ts
const TanStackServerFnsPlugin = createTanStackServerFnPlugin({
  // This is the ID (virtual module) that will be made available to look up
  // and import our server function manifest and resolve its modules.
  manifestVirtualImportId: 'tanstack:server-fn-manifest',
  client: {
    getRuntimeCode: () =>
      `import { createClientRpc } from '@tanstack/react-start/client-runtime'`,
    replacer: (opts) => `createClientRpc(${JSON.stringify(opts.functionId)})`,
  },
  ssr: {
    getRuntimeCode: () =>
      `import { createSsrRpc } from '@tanstack/react-start/ssr-runtime'`,
    replacer: (opts) => `createSsrRpc(${JSON.stringify(opts.functionId)})`,
  },
  server: {
    getRuntimeCode: () =>
      `import { createServerRpc } from '@tanstack/react-start/server-runtime'`,
    replacer: (opts) =>
      `createServerRpc(${JSON.stringify(opts.functionId)}, ${opts.fn})`,
  },
})
```

Then you can inject the plugin into the appropriate vite config plugin arrays:

```ts
clientVitePlugins: [TanStackServerFnsPlugin.client]
ssrVitePlugins: [TanStackServerFnsPlugin.ssr]
serverVitePlugins: [TanStackServerFnsPlugin.server]
```

## Providing the wrapper implementations

Each runtime replacement should be implemented by your framework. Generally, on the client and SSR runtimes, you'll end up using a `fetch` call to call the server function your desired endpoint, like this:

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
import serverFnManifest from 'tanstack:server-fn-manifest'

export const handler = async (req: Request) => {
  const functionId = req.url.split('/').pop()
  invariant(functionId, 'No function ID provided')

  const fnInfo = serverFnManifest[functionId]
  invariant(fn, `Server function ${functionId} not found`)

  const fnModule = await fnInfo.importer()
  invariant(fnModule, `Server function ${functionId} could not be imported`)

  const args = await req.json()

  return await fnModule(...args)
}
```
