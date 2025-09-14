---
ref: docs/router/framework/react/routing/file-based-routing.md
replace: { 'react-router': 'solid-router' }
---

[//]: # 'SupportedBundlersList'

- [Configuration with Vite](#configuration-with-vite)

[//]: # 'SupportedBundlersList'
[//]: # 'ConfigurationBundlerVite'

### Configuration with Vite

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

Or, you can clone our [Quickstart Vite example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-file-based) and get started.

Now that you've added the plugin to your Vite configuration, you're all set to start using file-based routing with TanStack Router.

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

[//]: # 'ConfigurationBundlerVite'
[//]: # 'ConfigurationBundlerRspack'
[//]: # 'ConfigurationBundlerRspack'
[//]: # 'ConfigurationBundlerWebpack'
[//]: # 'ConfigurationBundlerWebpack'
[//]: # 'ConfigurationBundlerEsbuild'
[//]: # 'ConfigurationBundlerEsbuild'
