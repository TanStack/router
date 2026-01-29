---
name: rspack-installation
---

# Rspack/Rsbuild Installation

Setting up TanStack Router with Rspack or Rsbuild bundler.

## Installation

```bash
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin
```

## Rspack Configuration

```ts
// rspack.config.ts
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

export default {
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
}
```

## Rsbuild Configuration

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

export default defineConfig({
  tools: {
    rspack: {
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
        }),
      ],
    },
  },
})
```

## Configuration Options

```ts
tanstackRouter({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  quoteStyle: 'single',
})
```

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   └── about.tsx
├── routeTree.gen.ts    # Auto-generated
└── main.tsx
```

## Ignoring Generated Files

Add to `.prettierignore`, `.eslintignore`:

```
routeTree.gen.ts
```

## Quickstart Template

```bash
git clone https://github.com/TanStack/router.git
cd router/examples/react/quickstart-rspack-file-based
npm install && npm run dev
```
