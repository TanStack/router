---
ref: docs/router/framework/react/installation/with-vite.md
---

[//]: # 'BundlerConfiguration'

To use file-based routing with **Vite**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your Vite configuration.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'solid',
      autoCodeSplitting: true,
    }),
    solid(),
    // ...
  ],
})
```

If you are using TypeScript, you should also add the following options to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  }
}
```

Or, you can clone our [Quickstart Vite example](https://github.com/TanStack/router/tree/main/examples/solid/quickstart-file-based) and get started.

Now that you've added the plugin to your Vite configuration, you're all set to start using file-based routing with TanStack Router.

[//]: # 'BundlerConfiguration'
