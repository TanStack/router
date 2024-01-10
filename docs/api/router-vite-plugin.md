---
id: Router Vite Plugin
title: Route Vite Plugin (Route Generation)
---

The `@tanstack/router-vite-plugin` package is a vite plugin that can be used instead of the [`@tanstack/router-cli`](./router-cli) package to generate routes for your project. It is a drop-in replacement for the CLI and can be used in the same way, but instead of calling `tsr generate` or `tsr watch`, you simply add the plugin to your vite config!

## Installation

```bash
npm install @tanstack/router-vite-plugin
```

## Usage

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...,
    TanStackRouterVite(),
  ],
})
```

## Configuration

Configuration is done via the `tsr.config.json` file. Please see the [Router CLI](./router-cli.md) documentation for more information on the configuration options.
