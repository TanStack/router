# TanStack Router - Rspack File-Based-Tauri Quickstart

A quickstart example using Rspack as the bundler with file-based-tauri routing.

- [TanStack Router Docs](https://tanstack.com/router)
- [Rspack Documentation](https://www.rspack.dev/)

## Start a new project based on this example

To start a new project based on this example, run:

```sh
npx gitpick TanStack/router/tree/main/examples/react/quickstart-rspack-file-based-tauri quickstart-rspack-file-based-tauri
```

## Getting Started

Install dependencies:

```sh
pnpm install
```

Start the development server:

```sh
pnpm dev
```

## Build

Build for production:

```sh
pnpm build
```

## About This Example

This example demonstrates:

- Rspack bundler integration
- file-based-tauri routing
- Fast build times with Rust-based tooling
- Webpack-compatible configuration


**Note** If you want to build a Tauri application, you might encounter some issues with route requests. For example, after accessing a route, there might actually be a request address like `http://tauri.localhost/lazy-compilation-using-`. In this case, you need to set [`lazyCompilation`](https://rsbuild.rs/config/dev/lazy-compilation#introduction) to `false`.

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

export default defineConfig({
  plugins: [pluginReact()],
  tools: {
    rspack: {
      plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true })],
    },
  },
  dev: {
    lazyCompilation: false,
  },
})

```
